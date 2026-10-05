import "@/core/config/load-env";
import { prisma } from "@/core/db/client";
import { catalogSeedRows } from "@/core/systems/catalog-seed";

/**
 * Seeds every curated system from `systems-catalog` into the `app` catalog so
 * customers can see them on `/{org}/my-apps` and the marketplace.
 *
 * Idempotent: keyed on `slug`, so re-running refreshes names/routes and is safe
 * after a catalog edit. Existing rows are updated only when a field actually
 * differs, which keeps the run quiet and makes drift visible in the log.
 *
 * Run: npx tsx scripts/seed-full-catalog.ts [--dry-run]
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = catalogSeedRows();
  const available = rows.filter((r) => !r.soon);
  const soon = rows.filter((r) => r.soon);

  console.log(`[seed-full-catalog] ${rows.length} catalog systems: ${available.length} available, ${soon.length} coming soon.`);
  if (dryRun) console.log("[seed-full-catalog] dry run, writing nothing.");

  const existing = await prisma.app.findMany({
    where: { slug: { in: rows.map((r) => r.slug) } },
    select: {
      id: true,
      slug: true,
      name: true,
      nameAr: true,
      description: true,
      descriptionAr: true,
      icon: true,
      category: true,
      version: true,
      routePrefix: true,
    },
  });
  const existingBySlug = new Map(existing.map((r) => [r.slug, r]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const drifted: string[] = [];

  for (const row of rows) {
    const data = {
      name: row.name,
      nameAr: row.nameAr,
      description: row.description,
      descriptionAr: row.descriptionAr,
      icon: row.icon,
      category: row.category,
      version: row.version,
      routePrefix: row.routePrefix,
    };
    const current = existingBySlug.get(row.slug);

    if (!current) {
      if (!dryRun) await prisma.app.create({ data: { slug: row.slug, ...data } });
      created++;
      continue;
    }

    const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
      (k) => (current[k] ?? null) !== (data[k] ?? null),
    );
    if (changed.length === 0) {
      unchanged++;
      continue;
    }
    drifted.push(`${row.slug}: ${changed.join(", ")}`);
    if (!dryRun) await prisma.app.update({ where: { id: current.id }, data });
    updated++;
  }

  if (drifted.length) {
    console.log(`[seed-full-catalog] updated fields on ${drifted.length} existing row(s):`);
    for (const d of drifted.slice(0, 20)) console.log(`  - ${d}`);
    if (drifted.length > 20) console.log(`  ... and ${drifted.length - 20} more`);
  }
  console.log(
    `[seed-full-catalog] ${dryRun ? "would apply" : "applied"}: ${created} created, ${updated} updated, ${unchanged} unchanged.`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed-full-catalog] failed:", err);
  process.exitCode = 1;
});
