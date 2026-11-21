import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../env";

const TTL_MS = 15 * 60_000;

const sign = (data: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET).update(`github-install:${data}`).digest("base64url");

/** CSRF state for the install round trip, bound to the signed-in user and short-lived. */
export function createInstallState(userId: string): string {
  const data = `${Buffer.from(userId).toString("base64url")}.${Date.now() + TTL_MS}.${randomBytes(8).toString("hex")}`;
  return `${data}.${sign(data)}`;
}

export function verifyInstallState(state: string | undefined, userId: string): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [uid, exp, nonce, mac] = parts as [string, string, string, string];
  const data = `${uid}.${exp}.${nonce}`;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  if (Number(exp) < Date.now()) return false;
  return Buffer.from(uid, "base64url").toString() === userId;
}
