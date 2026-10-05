import { sharedPrisma } from "@/core/db/client";
import { getEnv } from "@/core/config/env";
import { grocerySchemaName, provisionGrocerySchema } from "@/core/tenancy/schemas";

/**
 * Applies the grocery app's migrations to `grocery_<slug>` for every org in the
 * shared server. Idempotent: migrations already applied are skipped.
 *
 * Run: npx tsx scripts/provision-grocery-tenant.ts [--slug <slug>]
 */
async function main() {
  getEnv();
  const slugIndex = process.argv.indexOf("--slug");
  const only = slugIndex >= 0 ? process.argv[slugIndex + 1] : null;

  const organizations = await sharedPrisma.organization.findMany({
    where: only ? { slug: only } : undefined,
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  for (const organization of organizations) {
    const schema = grocerySchemaName(organization.slug);
    await provisionGrocerySchema(schema);
    console.log(`${organization.slug}: ${schema}`);
  }
  await sharedPrisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await sharedPrisma.$disconnect();
  process.exitCode = 1;
});
