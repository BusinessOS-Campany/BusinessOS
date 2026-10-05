import "../src/core/config/load-env";
import { prisma } from "@/core/db/client";

async function main() {
  const orgs = await prisma.organization.findMany({ 
    select: { id: true, name: true, slug: true, settings: true } 
  });
  console.log(JSON.stringify(orgs, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);