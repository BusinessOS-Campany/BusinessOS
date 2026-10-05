import type { Prisma } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";

/**
 * Gap-tolerant document numbering. The counter increments inside the caller's
 * transaction: concurrent callers serialize on the row update; a rollback may
 * burn a value (gap) which the spec explicitly tolerates — numbers are unique
 * and monotonically increasing per org, never reused.
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  key: "sales_invoice" | "sales_return" | "purchase" | "expense",
  overrides?: { prefix?: string; padding?: number },
): Promise<string> {
  const existing = await tx.numberSequence.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { id: true, prefix: true, padding: true },
  });

  if (!existing && !overrides?.prefix) {
    // Sequences must be provisioned explicitly (seed or settings UI) so the
    // prefix is always an owner-controlled decision, not a silent default.
    throw ApiError.badRequest(`Number sequence "${key}" is not configured`, { key });
  }

  const row = existing
    ? await tx.numberSequence.update({
        where: { id: existing.id },
        data: { nextValue: { increment: 1 } },
        select: { prefix: true, padding: true, nextValue: true },
      })
    : await tx.numberSequence.create({
        data: {
          organizationId,
          key,
          prefix: overrides!.prefix!,
          padding: overrides?.padding ?? 5,
          // create returns the seeded value; consume it by jumping to seed+1
          // and issuing the seed value itself.
          nextValue: 2,
        },
        select: { prefix: true, padding: true, nextValue: true },
      }).then((r) => ({ ...r, nextValue: 1 }));

  const num = String(row.nextValue).padStart(row.padding, "0");
  return `${row.prefix ?? ""}${num}`;
}
