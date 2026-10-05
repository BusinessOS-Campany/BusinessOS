import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  // Prisma qualifies every table with the schema the adapter reports, and the
  // adapter reports `public` unless it is told otherwise — it does not read the
  // connection string. `?schema=` in the URL is a Prisma-CLI key that node-postgres
  // drops, so an org kept in its own schema needs `DATABASE_SCHEMA` as well.
  // Unset means `public`, which is how the app ran before.
  const schema = process.env.DATABASE_SCHEMA;
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema },
  )
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma