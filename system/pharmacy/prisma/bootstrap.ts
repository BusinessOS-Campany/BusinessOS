// Per-organization bootstrap: the one branch and the one warehouse stock is
// written against. No demo users, no sample medicines, no categories.
//
// This is deliberately NOT `prisma/seed.ts`. The seed is a development fixture:
// it creates a full cast of staff on one published password and fills the
// pharmacy with fictional medicines. Running that inside a customer's own
// database would hand every org the same logins. This file instead tops up a
// real org's database, and is safe to run on every start.
//
// The branch and warehouse are the org's own, empty and neutrally named, for its
// staff to extend. They are required rather than cosmetic: `stockLevel`,
// `inventoryMovement` and `stockAdjustment` all declare `warehouseId` as a
// non-null column, and this app ships no page that can create a warehouse — so
// without this row the first purchase receipt, stock count or POS sale could not
// be recorded at all.
//
// Run: npx tsx prisma/bootstrap.ts
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// `PGSCHEMA`, not `DATABASE_SCHEMA`: this is the same variable `src/lib/prisma.ts`
// reads, so bootstrap and the app always agree on where the rows go. The
// adapter reports `public` unless told otherwise, and a seeded org in its own
// schema would otherwise write to `public`.
const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.PGSCHEMA ?? "public" },
)
const prisma = new PrismaClient({ adapter })

async function main() {
  const created: string[] = []

  // "The first one" rather than "the only one": an org that has split its stock
  // across several branches or warehouses keeps its own, and this only ever
  // fills an empty table.
  const branch = await prisma.branch.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  const branchRow =
    branch ??
    (await prisma.branch.create({
      data: { nameAr: "الفرع الرئيسي", nameEn: "Main Branch", isMain: true, isActive: true },
      select: { id: true },
    }))
  if (!branch) created.push("branch")

  const warehouse = await prisma.warehouse.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  if (!warehouse) {
    await prisma.warehouse.create({
      data: {
        branchId: branchRow.id,
        nameAr: "المستودع الرئيسي",
        nameEn: "Main Warehouse",
        isMain: true,
        isActive: true,
      },
    })
    created.push("warehouse")
  }

  console.log(
    `[bootstrap] schema=${process.env.PGSCHEMA ?? "public"} ` +
      `created=${created.length > 0 ? created.join("+") : "none"} ok`,
  )
}

main()
  .catch((err) => {
    console.error("[bootstrap] failed:", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
