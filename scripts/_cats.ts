import "@/core/config/load-env";
import { prisma } from "@/core/db/client";
import { CATEGORY_MAP } from "@/core/demo/systems-catalog";

async function main() {
  const rows = await prisma.app.findMany({ select: { category: true }, distinct: ["category"] });
  const ids = rows.map((r) => r.category).sort();
  console.log("distinct app.category values in DB:", ids.length);
  let unknown = 0;
  for (const id of ids) {
    const ok = Boolean(CATEGORY_MAP[id]);
    if (!ok) unknown++;
    console.log(`  ${id.padEnd(14)} -> catalog: ${ok ? CATEGORY_MAP[id].titleAr + " / " + CATEGORY_MAP[id].titleEn : "NOT FOUND"}`);
  }
  console.log("unknown categories:", unknown);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
