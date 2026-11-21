import { eq } from "drizzle-orm";
import { db } from "../db";
import { emailDeliveryLogs } from "../db/schema";

/**
 * Email through Resend. If RESEND_API_KEY is not set the delivery is logged as "skipped"
 * (visible in email_delivery_logs) instead of failing the job.
 */
export async function sendEmail(logId: string, to: string, subject: string, html: string): Promise<"sent" | "skipped"> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await db.update(emailDeliveryLogs).set({ status: "skipped", error: "RESEND_API_KEY not configured" }).where(eq(emailDeliveryLogs.id, logId));
    return "skipped";
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "RepoSec <onboarding@resend.dev>", to, subject, html }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    await db.update(emailDeliveryLogs).set({ status: "failed", error: body.message?.slice(0, 500) ?? `HTTP ${res.status}`, attempts: 1 }).where(eq(emailDeliveryLogs.id, logId));
    throw new Error(`Email send failed (${res.status})`); // job retry with backoff
  }
  await db.update(emailDeliveryLogs).set({ status: "sent", providerMessageId: body.id ?? null, sentAt: new Date(), attempts: 1 }).where(eq(emailDeliveryLogs.id, logId));
  return "sent";
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
