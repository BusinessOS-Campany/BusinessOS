import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? undefined },
  )
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma