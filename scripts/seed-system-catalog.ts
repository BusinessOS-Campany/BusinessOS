import "@/core/config/load-env";
import { prisma } from "@/core/db/client";
import { seedDemoCatalog } from "@/core/apps/service";

/**
 * Seeds the demo systems into the central app catalog (idempotent).
 * Run: npx tsx scripts/seed-system-catalog.ts
 */
async function main() {
  const count = await seedDemoCatalog();
  console.log(`[seed-system-catalog] upserted ${count} demo system(s) into the app catalog.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed-system-catalog] failed:", err);
  process.exitCode = 1;
});