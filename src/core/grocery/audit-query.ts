import type { Prisma } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";

export interface ListAuditLogsOpts {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(organizationId: string, opts?: ListAuditLogsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.auditLogWhereInput = { organizationId };
  if (opts?.action) where.action = opts.action;
  if (opts?.entityType) where.entityType = opts.entityType;
  if (opts?.entityId) where.entityId = opts.entityId;
  if (opts?.actorUserId) where.actorUserId = opts.actorUserId;
  if (opts?.from || opts?.to) {
    where.createdAt = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getAuditFacets(organizationId: string) {
  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { organizationId },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  return {
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entityType),
  };
}
