import { AuditAction } from "@prisma/client";

import { prisma } from "@/lib/db";

export const logAudit = async ({
  actorId,
  targetUserId,
  action,
  entityType,
  entityId,
  details
}: {
  actorId?: string | null;
  targetUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}) =>
  prisma.auditLog.create({
    data: {
      actorId: actorId ?? undefined,
      targetUserId: targetUserId ?? undefined,
      action,
      entityType,
      entityId,
      detailsJson: details ? JSON.stringify(details) : undefined
    }
  });
