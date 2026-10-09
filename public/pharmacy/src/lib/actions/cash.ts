"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { toMinor } from "@/lib/format";

export async function openCashSession(cashAccountId: string, openingBalance: number) {
  const user = await requirePermission("cash:manage");
  const open = await prisma.cashSession.findFirst({ where: { cashAccountId, status: "open" } });
  if (open) throw new Error("Session already open");

  const opening = toMinor(openingBalance);
  await prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.create({
      data: {
        cashAccountId,
        userId: user.id,
        openingBalance: opening,
        status: "open",
      },
    });
    if (opening > 0n) {
      await tx.cashMovement.create({
        data: { cashAccountId, sessionId: session.id, delta: opening, reason: "opening", createdByUserId: user.id },
      });
    }
  });

  await recordAudit(user.id, AUDIT_ACTIONS.OPEN_CASH, "cashSession", cashAccountId, { after: { opening: opening.toString() } });
  revalidatePath("/cash");
  return { ok: true };
}

export async function closeCashSession(sessionId: string, actualBalance: number) {
  const user = await requirePermission("cash:manage");
  const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "closed") throw new Error("Session not open");

  const movements = await prisma.cashMovement.findMany({ where: { sessionId } });
  const expected = BigInt(movements.reduce((s, m) => s + Number(m.delta), 0)) + (session.openingBalance ?? 0n);
  const actual = toMinor(actualBalance);
  const discrepancy = actual - expected;

  await prisma.cashSession.update({
    where: { id: sessionId },
    data: { closingBalance: expected, actualBalance: actual, discrepancy, status: "closed", closedAt: new Date() },
  });

  await recordAudit(user.id, AUDIT_ACTIONS.CLOSE_CASH, "cashSession", sessionId, { after: { expected: expected.toString(), actual: actual.toString(), discrepancy: discrepancy.toString() } });
  revalidatePath("/cash");
  return { ok: true };
}

const moveSchema = z.object({
  cashAccountId: z.string().min(1),
  amount: z.coerce.number().positive(),
  note: z.string().optional().nullable(),
});

export async function depositCash(input: z.infer<typeof moveSchema>) {
  const user = await requirePermission("cash:manage");
  const data = moveSchema.parse(input);
  const session = await prisma.cashSession.findFirst({ where: { cashAccountId: data.cashAccountId, status: "open" } });
  await prisma.cashMovement.create({
    data: {
      cashAccountId: data.cashAccountId,
      sessionId: session?.id ?? null,
      delta: toMinor(data.amount),
      reason: "deposit",
      note: data.note || null,
      createdByUserId: user.id,
    },
  });
  await recordAudit(user.id, AUDIT_ACTIONS.PAYMENT, "cash", data.cashAccountId, { after: { deposit: toMinor(data.amount).toString() } });
  revalidatePath("/cash");
  return { ok: true };
}

export async function withdrawCash(input: z.infer<typeof moveSchema>) {
  const user = await requirePermission("cash:manage");
  const data = moveSchema.parse(input);
  const session = await prisma.cashSession.findFirst({ where: { cashAccountId: data.cashAccountId, status: "open" } });
  await prisma.cashMovement.create({
    data: {
      cashAccountId: data.cashAccountId,
      sessionId: session?.id ?? null,
      delta: -toMinor(data.amount),
      reason: "withdrawal",
      note: data.note || null,
      createdByUserId: user.id,
    },
  });
  await recordAudit(user.id, AUDIT_ACTIONS.PAYMENT, "cash", data.cashAccountId, { after: { withdrawal: toMinor(data.amount).toString() } });
  revalidatePath("/cash");
  return { ok: true };
}