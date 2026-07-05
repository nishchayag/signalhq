import AuditLogModel, { AuditAction } from "@/models/auditLog.model";

/**
 * Record an org activity entry. Best-effort — a logging failure must never
 * break the underlying action it's describing, so errors are swallowed
 * (logged to console) rather than thrown.
 */
export async function logActivity(entry: {
  organizationId: string;
  actorUserId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await AuditLogModel.create(entry);
  } catch (error) {
    console.error("Failed to write audit log entry:", entry.action, error);
  }
}
