import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env } from "./env";
import { authPlugin } from "./plugins/auth";
import { ApiError, errorBody } from "./lib/errors";
import { githubRoutes } from "./routes/github";
import { remediationRoutes } from "./routes/remediation";
import { repositoryRoutes } from "./routes/repositories";
import { reportRoutes, securityRoutes } from "./routes/security";
import { webhookRoutes } from "./routes/webhooks";
import { workspaceRoutes } from "./routes/workspace";
import { hit } from "./lib/rate-limit";
import { clearCache } from "./lib/cache";

export const app = new Elysia()
  .use(
    cors({
      origin: env.FRONTEND_URL,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .onError({ as: "global" }, ({ code, error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return errorBody(error.code, error.message, error.details);
    }
    if (code === "VALIDATION") {
      set.status = 422;
      return errorBody("validation_error", "Request validation failed", error.all);
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return errorBody("not_found", "Route not found");
    }
    if (code === "PARSE") {
      set.status = 400;
      return errorBody("bad_request", "Malformed request body");
    }
    // Never leak internals (stack traces, SQL, tokens) to the client.
    console.error("[api] unhandled error", error);
    set.status = 500;
    return errorBody("internal_error", "Something went wrong");
  })
  .onBeforeHandle({ as: "global" }, ({ request, server, set }) => {
    // Basic abuse protection: per-IP limits (webhooks are signature-gated and exempt).
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/v1/webhooks/") || url.pathname === "/health") return;
    const ip = server?.requestIP(request)?.address ?? request.headers.get("x-forwarded-for") ?? "unknown";
    const wait = hit(`ip:${ip}:${request.method === "GET" ? "r" : "w"}`, request.method === "GET" ? 900 : 180);
    if (wait) {
      set.status = 429;
      set.headers["retry-after"] = String(wait);
      return errorBody("rate_limited", `Too many requests. Retry in ${wait}s`);
    }
  })
  .onAfterHandle({ as: "global" }, ({ request }) => {
    // Any write may change what GET endpoints return: drop cached reads so the UI never shows its own change as stale.
    if (request.method !== "GET" && request.method !== "OPTIONS" && request.method !== "HEAD") clearCache();
  })
  .use(authPlugin)
  .get("/health", () => ({ status: "ok" }))
  .group("/api/v1", (api) =>
    api
      .use(githubRoutes)
      .use(repositoryRoutes)
      .use(securityRoutes)
      .use(reportRoutes)
      .use(remediationRoutes)
      .use(workspaceRoutes)
      .use(webhookRoutes)
      .get(
      "/me",
      ({ user }) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        githubLogin: user.githubLogin ?? null,
      }),
      { auth: true },
    ),
  )
  .listen(env.PORT);

console.log(`API listening on http://${app.server?.hostname}:${app.server?.port}`);
