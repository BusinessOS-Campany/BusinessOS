// Per-organization bootstrap. Reference data only: the ten system roles the app
// authorises against. No demo users, no sample patients.
//
// This is deliberately NOT `prisma/seed.ts`. The seed is a development fixture:
// it creates an admin plus a full cast of staff on one published password and
// fills the clinic with fictional patients. Running that inside a customer's own
// database would hand every org the same logins. This file instead tops up a
// real org's database, and is safe to run on every start.
//
// Run: npx tsx prisma/bootstrap.ts
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { ROLE_DEFINITIONS, ROLE_KEYS, type RoleKey } from "../src/lib/permissions"

// Same schema the runtime uses: the adapter reports `public` unless told the
// schema, and a seeded org in its own schema would otherwise write to `public`.
const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA },
)
const prisma = new PrismaClient({ adapter })

async function main() {
  const created: string[] = []
  const permissionsFilled: string[] = []

  for (const key of ROLE_KEYS) {
    const definition = ROLE_DEFINITIONS[key as RoleKey]
    const existing = await prisma.role.findUnique({ where: { key }, select: { id: true, permissions: true } })

    if (!existing) {
      await prisma.role.create({
        data: {
          key,
          name: definition.name,
          nameAr: definition.nameAr,
          permissions: [...definition.permissions],
          isSystem: true,
        },
      })
      created.push(key)
      continue
    }

    // A role with no permissions cannot authorise anything, which happens when a
    // row was created before `ROLE_DEFINITIONS` had an entry for it. Filling an
    // EMPTY list only is what keeps this additive: an org that has trimmed a
    // role's permissions on purpose keeps its own version.
    if (existing.permissions.length === 0 && definition.permissions.length > 0) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { permissions: [...definition.permissions] },
      })
      permissionsFilled.push(key)
    }
  }

  console.log(
    `[bootstrap] schema=${process.env.DATABASE_SCHEMA ?? "public"} ` +
      `roles=${ROLE_KEYS.length} created=${created.length > 0 ? created.join("+") : "none"} ` +
      `permissionsFilled=${permissionsFilled.length > 0 ? permissionsFilled.join("+") : "none"} ok`,
  )
}

main()
  .catch((err) => {
    console.error("[bootstrap] failed:", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())