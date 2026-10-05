import "../src/core/config/load-env";
import { prisma } from "@/core/db/client";

async function main() {
  const orgSlug = "gm-ssnow";
  const customDomain = "shop.gmsnow.com"; // Replace with your actual custom domain
  
  const org = await prisma.organization.update({
    where: { slug: orgSlug },
    data: {
      settings: {
        domains: [customDomain, `www.${customDomain}`]
      }
    },
    select: { id: true, name: true, slug: true, settings: true }
  });
  
  console.log("Updated organization:", JSON.stringify(org, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);