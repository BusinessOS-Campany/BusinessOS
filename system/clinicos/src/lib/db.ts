import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  const adapter = new PrismaPg(
    {
      connectionString: process.env.DATABASE_URL,
    },
    {
      schema: process.env.DATABASE_SCHEMA ?? new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "public",
    },
  )
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}