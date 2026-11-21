import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "../db";
import { emailDeliveryLogs } from "../db/schema";

/**
 * Email through the Resend SDK (HTML rendered from React Email templates in src/emails). If RESEND_API_KEY is not set the delivery is logged as "skipped"
 * (visible in email_delivery_logs) instead of failing the job.
 */
export async function sendEmail(logId: string, to: string, subject: string, html: string): Promise<"sent" | "skipped"> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await db.update(emailDeliveryLogs).set({ status: "skipped", error: "RESEND_API_KEY not configured" }).where(eq(emailDeliveryLogs.id, logId));
    return "skipped";
  }
  const { data, error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM ?? "RepoSec <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  if (error) {
    await db.update(emailDeliveryLogs).set({ status: "failed", error: error.message.slice(0, 500), attempts: 1 }).where(eq(emailDeliveryLogs.id, logId));
    throw new Error(`Email send failed (${error.name})`); // job retry with backoff
  }
  await db.update(emailDeliveryLogs).set({ status: "sent", providerMessageId: data?.id ?? null, sentAt: new Date(), attempts: 1 }).where(eq(emailDeliveryLogs.id, logId));
  return "sent";
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
