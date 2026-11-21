import { Elysia } from "elysia";
import { ApiError } from "../lib/errors";
import { handleGithubWebhook, verifySignature } from "../services/webhooks";

/** Signature is verified over the raw body before anything is parsed or stored. */
export const webhookRoutes = new Elysia({ prefix: "/webhooks" }).post(
  "/github",
  async ({ body, headers }) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(503, "webhook_not_configured", "GITHUB_WEBHOOK_SECRET is not set");
    const raw = typeof body === "string" ? body : "";
    if (!verifySignature(secret, raw, headers["x-hub-signature-256"] ?? null)) throw new ApiError(401, "invalid_signature", "Invalid webhook signature");
    const deliveryId = headers["x-github-delivery"];
    const event = headers["x-github-event"];
    if (!deliveryId || !event) throw new ApiError(400, "bad_request", "Missing GitHub delivery headers");
    const result = await handleGithubWebhook(deliveryId, event, JSON.parse(raw));
    return { ok: true, duplicate: result === "duplicate" };
  },
  { parse: "text" },
);
