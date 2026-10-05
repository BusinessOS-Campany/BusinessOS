import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

type LogAudit = {
  userId?: string | null
  action: string
  module: string
  recordId?: string
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

export async function logAudit(data: LogAudit): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        action: data.action,
        module: data.module,
        recordId: data.recordId ?? null,
        oldValue: (data.oldValue as Prisma.InputJsonValue) ?? null,
        newValue: (data.newValue as Prisma.InputJsonValue) ?? null,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
    })
  } catch {
    console.error("Audit log write failed — non-blocking")
  }
}