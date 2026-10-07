import "@/core/config/load-env";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/core/db/client";
import { withRegistry } from "@/core/org-vault/registry";
import { orgVaultRoot } from "@/core/org-vault/paths";

/**
 * Remove probe orgs left behind by the browser check scripts: DB rows, the vault
 * folder, and the registry entry.
 *
 * Run this with the platform STOPPED, or right after a restart. The running
 * server holds the registry in memory and rewrites the file from that cache on its
 * next write, which resurrects entries this script removed; and it can hold a
 * handle on a vault folder, which makes the delete fail with EPERM.
 */
async function main() {
  const rows = await prisma.organization.findMany({
    where: {
      OR: [
        { slug: { startsWith: "probe-" } },
        { slug: { startsWith: "dbg-" } },
      ],
    },
    select: { id: true, slug: true },
  });
  console.log("probe orgs in the database:", rows.length, rows.map((o) => o.slug).join(", "));

  for (const slug of [
    "probe-sysinstall-",
    "probe-profileopen-",
    "dbg-",
  ]) {
    await prisma.organizationApp.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
    await prisma.organizationAppRequest.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
    await prisma.member.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
    await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
    await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  }
  await prisma.user.deleteMany({
    where: { OR: [{ email: { endsWith: "@sysinstall.local" } }, { email: { endsWith: "@dbg.local" } }, { email: { endsWith: "@profileopen.local" } }] },
  });

  const root = orgVaultRoot();
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^(probe-|dbg-)/.test(e.name))
    .map((e) => e.name);
  for (const name of folders) {
    try {
      rmSync(join(root, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
    } catch (e: any) {
      const msg = e && e.message ? e.message.split("\n")[0] : String(e);
      const code = e && e.code ? e.code : "";
      if (code === "EPERM" || code === "EBUSY") {
        console.warn(`  skipping (in use, ${code}): ${name} — ${msg}`);
      } else {
        console.warn(`  left behind: ${name} — ${msg}`);
      }
    }
  }
  console.log("folders removed:", folders.length);

  await withRegistry((registry) => {
    for (const [key, value] of Object.entries(registry.orgs)) {
      if (/^(probe-|dbg-)/.test(key) || /^(probe-|dbg-)/.test(value.slug)) delete registry.orgs[key];
    }
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});