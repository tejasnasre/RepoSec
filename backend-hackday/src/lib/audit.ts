import { db } from "../db";
import { auditLogs } from "../db/schema";

/** Best-effort audit trail; never throws into the request path. Do not put tokens/secrets in `meta`. */
export function audit(userId: string | null, action: string, entityType?: string, entityId?: string, meta?: Record<string, unknown>) {
  void db.insert(auditLogs).values({ userId, action, entityType, entityId, meta }).catch((e) => console.error("[audit] failed", e instanceof Error ? e.message : e));
}
