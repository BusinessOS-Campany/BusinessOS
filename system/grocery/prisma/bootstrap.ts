// Per-organization bootstrap. Reference data only: permissions, roles, and the
// two settings rows the app assumes exist. No demo users, no sample products.
//
// This is deliberately NOT `prisma/seed.ts`. The seed is a development fixture:
// it wipes the database, creates eight accounts that all share one published
// password, and fills the catalog with a fictional grocery. Running that inside
// a customer's own database would hand every org the same logins. This file
// instead tops up a real org's database, and is safe to run on every start.
//
// Run: npx tsx prisma/bootstrap.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = (process.env.DATABASE_URL ?? "").replace(/\?schema=[^&]*$/, "");
if (!url) throw new Error("DATABASE_URL missing");

const schema = process.env.DATABASE_SCHEMA ?? "public";
const db = new PrismaClient({ adapter: new PrismaPg(url, { schema }) });

/**
 * The reference rows every fresh organization needs before it can record a
 * product. Named in both scripts because the system is Arabic-first and the
 * English name has to sort and search identically for an operator who types it.
 */
const DEFAULT_CATEGORY_NAME = "General";
const DEFAULT_CATEGORY_NAME_AR = "عام";
const DEFAULT_UNIT_NAME = "Piece";
const DEFAULT_UNIT_NAME_AR = "قطعة";
const DEFAULT_UNIT_SYMBOL = "pcs";

async function main() {
  const { PERMISSIONS, ROLE_MATRIX, ROLE_NAMES_AR } = await import("../src/shared/auth/rbac");

  // `Permission` is keyed by `key` (it is its own primary key), so the map is
  // of key -> key and presence is all that matters.
  const existingPermissions = new Set(
    (await db.permission.findMany({ select: { key: true } })).map((p) => p.key),
  );
  for (const p of PERMISSIONS) {
    if (existingPermissions.has(p.key)) continue;
    await db.permission.create({
      data: { key: p.key, description: p.description, group: p.group },
    });
    existingPermissions.add(p.key);
  }

  const roles = new Map(
    (await db.role.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id]),
  );
  for (const [roleName, keys] of Object.entries(ROLE_MATRIX)) {
    let roleId = roles.get(roleName);
    if (!roleId) {
      const role = await db.role.create({
        data: { name: roleName, nameAr: ROLE_NAMES_AR[roleName] ?? null, isSystem: true },
        select: { id: true },
      });
      roleId = role.id;
      roles.set(roleName, roleId);
    }

    const wanted = keys === "*" ? PERMISSIONS.map((p) => p.key) : keys;
    const held = new Set(
      (await db.rolePermission.findMany({ where: { roleId }, select: { permissionKey: true } }))
        .map((rp) => rp.permissionKey),
    );
    const missing = wanted
      .filter((key) => !held.has(key))
      .map((permissionKey) => ({ roleId: roleId!, permissionKey }));
    if (missing.length > 0) await db.rolePermission.createMany({ data: missing });
  }

  // The app reads these two rows by fixed id, so they have to exist before any
  // screen can render. Left empty here: the org fills in its own store details.
  if (!(await db.storeSettings.findUnique({ where: { id: "store" } }))) {
    await db.storeSettings.create({ data: { id: "store", name: "", currencyCode: "YER", currencySymbol: "ر.ي" } });
  }
  if (!(await db.systemSettings.findUnique({ where: { id: "system" } }))) {
    await db.systemSettings.create({
      data: { id: "system", expirationWarningDays: 30, language: "ar", timezone: "Asia/Aden" },
    });
  }

  // The minimum catalog a store needs before it can record anything.
  //
  // `Product.categoryId` and `Product.unitId` are both NOT NULL and both required
  // by the product form, so a database with neither is a dead end: the category
  // and unit pickers render empty, validation rejects the save, and the store
  // cannot enter its very first product. Nothing else in the system creates
  // them, so a fresh org has to be given them here.
  //
  // One general category and one base unit, and nothing more: they exist so the
  // form can be satisfied, not to pre-judge how this shop is organised. An org
  // that wants a real taxonomy creates its own and simply stops using these.
  // Additive and idempotent — an org that already has a category called "General"
  // keeps the one it made, and this never renames or rewrites anything.
  const created: string[] = [];

  const generalCategory = await db.category.findFirst({ where: { name: DEFAULT_CATEGORY_NAME, parentId: null } });
  if (!generalCategory) {
    await db.category.create({
      data: { name: DEFAULT_CATEGORY_NAME, nameAr: DEFAULT_CATEGORY_NAME_AR, description: null },
    });
    created.push("category");
  }

  // `Unit.name` is globally unique, so this one is a plain lookup.
  const baseUnit = await db.unit.findUnique({ where: { name: DEFAULT_UNIT_NAME } });
  if (!baseUnit) {
    await db.unit.create({
      data: {
        name: DEFAULT_UNIT_NAME,
        nameAr: DEFAULT_UNIT_NAME_AR,
        symbol: DEFAULT_UNIT_SYMBOL,
        isBase: true,
      },
    });
    created.push("unit");
  }

  console.log(
    `[bootstrap] schema=${schema} permissions=${existingPermissions.size} roles=${roles.size} ` +
      `seeded=${created.length > 0 ? created.join("+") : "none"} ok`,
  );
}

main()
  .catch((err) => {
    console.error("[bootstrap] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
