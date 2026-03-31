import prisma from "./prisma";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "SSH_COMMAND"
  | "BACKUP"
  | "SYNC"
  | "EMAIL"
  | "MONITOR"
  | "IMPORT"
  | "EXPORT"
  | "SETTINGS_CHANGE"
  | "API_ACCESS";

export type AuditEntity =
  | "client"
  | "vps"
  | "service"
  | "payment"
  | "user"
  | "system"
  | "backup"
  | "invoice"
  | "settings";

interface AuditLogParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  ipAddress?: string;
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        description: params.description,
        metadata: params.metadata ?? undefined,
        userId: params.userId,
        ipAddress: params.ipAddress,
      },
    });
  } catch (error) {
    console.error("[Audit] Failed to log:", error);
  }
}

// Helper to extract IP from request
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

// Helper to create notification alongside audit log
export async function logAuditWithNotification(
  params: AuditLogParams & { notificationType?: string; notificationTitle?: string }
): Promise<void> {
  try {
    await Promise.all([
      prisma.auditLog.create({
        data: {
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          description: params.description,
          metadata: params.metadata ?? undefined,
          userId: params.userId,
          ipAddress: params.ipAddress,
        },
      }),
      prisma.notification.create({
        data: {
          type: params.notificationType ?? "info",
          title: params.notificationTitle ?? params.description,
          message: params.description,
          metadata: {
            action: params.action,
            entity: params.entity,
            entityId: params.entityId,
          },
        },
      }),
    ]);
  } catch (error) {
    console.error("[Audit] Failed to log with notification:", error);
  }
}
