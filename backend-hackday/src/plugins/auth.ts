import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import { errorBody } from "../lib/errors";

/**
 * Mounts Better Auth at /api/auth/* and adds an `auth: true` route option that
 * resolves `user` and `session` (or responds 401).
 */
export const authPlugin = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401, errorBody("unauthorized", "Sign in required"));
        return { user: session.user, session: session.session };
      },
    },
  });
