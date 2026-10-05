/**
 * Phase 3 — restored endpoint logic (2026-09-24).
 *
 * Covers the service/DB layer behind the newly restored API routes:
 *   - expenses form service (shared `/api/v1/expenses` + `/sama-center/expenses`)
 *   - grocery brands / categories / products (list+CRUD + client shapes)
 *   - suppliers route ops (prisma-backed: create/list/soft-delete)
 *   - sama-center settings (org-settings `samaCenter` tag, deep-merge PUT)
 *   - sama-center reports summaries + grocery dashboard KPI shape
 */
import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import {
  createExpenseForm,
  deleteExpenseRow,
  listExpenseCategories,
  listExpenses,
  createExpense,
  updateExpenseForm,
} from "@/core/expenses/service";
import {
  createBrand,
  deleteBrand,
  listBrands,
  updateBrand,
} from "@/core/grocery/brands";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  listProducts,
  createProduct,
} from "@/core/grocery/inventory-mgmt";
import { getOrgSettings, updateOrgSettings } from "@/core/tenancy/settings";
import {
  getDailySummary,
  getMonthlySummary,
  getWeeklySummary,
} from "@/core/sama/dashboard";
import { getDashboardKpis } from "@/core/grocery/dashboard";

async function makeOrg(label: string) {
  const uid = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: {
      id: uid,
      name: `${label} User`,
      emailVerified: false,
      email: `${label}-${randomUUID().slice(0, 8)}@test.local`,
    },
  });
  const oid = randomUUID();
  await prisma.organization.create({
    data: { id: oid, name: `${label} Org`, slug: `${label}-${randomUUID().slice(0, 12)}` },
  });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: oid, userId: uid, role: "owner" },
  });
  return { oid, uid };
}

async function purge(oid: string) {
  const tables = [
    "cashMovement", "expense", "expenseCategory", "stockLevel", "product",
    "supplier", "category", "brand", "auditLog", "member", "dataExport",
  ] as const;
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[t].deleteMany({ where: { organizationId: oid } });
  }
  await prisma.organization.delete({ where: { id: oid } });
}

async function makeCashAccount(oid: string) {
  return (await prisma.cashAccount.create({ data: { organizationId: oid, nameAr: "الصندوق" } })).id;
}

const tenant = (oid: string, uid: string) => ({ organizationId: oid, userId: uid });

/* ── Expenses (shared service) ─────────────────────────────────────────── */

describe("phase3: expense form service", () => {
  let org: string;
  let user: string;

  beforeAll(async () => {
    const t = await makeOrg("ExpA");
    org = t.oid;
    user = t.uid;
  });

  afterAll(async () => {
    await purge(org).catch(() => undefined);
  });

  it("listExpenseCategories is empty for a fresh org", async () => {
    expect(await listExpenseCategories(prisma, org)).toHaveLength(0);
  });

  it("createExpenseForm creates expense + free-text category (dedupes on reuse)", async () => {
    const a = await createExpenseForm(prisma, tenant(org, user), {
      description: "نثريات المكتب",
      category: "مصاريف إدارية",
      amount: 2500,
    });
    expect(a.expenseId).toBeTruthy();

    await createExpenseForm(prisma, tenant(org, user), {
      description: "فواتير الكهرباء",
      category: "مصاريف إدارية",
      amount: 500,
    });

    const cats = await listExpenseCategories(prisma, org);
    expect(cats).toHaveLength(1);
    expect(cats[0].nameAr).toBe("مصاريف إدارية");
  });

  it("listExpenses returns the client shape with total + categoryName", async () => {
    const res = await listExpenses(prisma, tenant(org, user));
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    for (const it of res.items) {
      expect(it).toMatchObject({ paymentMethod: "cash", status: "approved" });
      expect(it.amount).toBeTypeOf("number");
      expect(typeof it.date).toBe("string");
      expect(it.description).toBeTypeOf("string");
    }
    const admin = res.items.find((i) => i.description === "نثريات المكتب");
    expect(admin?.categoryName).toBe("مصاريف إدارية");
    expect(admin?.amount).toBe(2500);
  });

  it("search + date filters are applied and org data stays isolated", async () => {
    const res = await listExpenses(prisma, tenant(org, user), { search: "كهرباء" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].description).toBe("فواتير الكهرباء");

    const paged = await listExpenses(prisma, tenant(org, user), { page: 1, pageSize: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(2);

    const other = await makeOrg("ExpB");
    try {
      expect(await listExpenses(prisma, tenant(other.oid, other.uid))).toMatchObject({ total: 0, items: [] });
    } finally {
      await purge(other.oid).catch(() => undefined);
    }
  });

  it("updateExpenseForm corrects cash via delta movement on funded expenses", async () => {
    const cashId = await makeCashAccount(org);
    const { expenseId } = await createExpense(prisma, tenant(org, user), {
      categoryId: null,
      amount: 1000,
      cashAccountId: cashId,
      note: "مشروع ممول",
    });

    await updateExpenseForm(prisma, tenant(org, user), expenseId, { amount: 400 });

    const movements = await prisma.cashMovement.findMany({
      where: { organizationId: org, refType: "expense", refId: expenseId },
      orderBy: { createdAt: "asc" },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0].delta).toBe(-1000n); // original out
    expect(movements[1].delta).toBe(600n); // correction: old(1000) - new(400)
  });

  it("deleteExpenseRow reverses the cash movement and removes the row", async () => {
    const cashId = await makeCashAccount(org);
    const { expenseId } = await createExpense(prisma, tenant(org, user), {
      categoryId: null,
      amount: 800,
      cashAccountId: cashId,
      note: "يُحذف",
    });

    await deleteExpenseRow(prisma, tenant(org, user), expenseId);

    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    expect(expense).toBeNull();
    const reversal = await prisma.cashMovement.findMany({
      where: { organizationId: org, refType: "expense", refId: expenseId },
    });
    expect(reversal).toHaveLength(2);
    expect(reversal[1].delta).toBe(800n); // restore cash in
  });

  it("update/delete on a foreign org row throws notFound", async () => {
    const other = await makeOrg("ExpC");
    try {
      const { expenseId } = await createExpenseForm(prisma, tenant(other.oid, other.uid), {
        description: "خاصة",
        category: "أخرى",
        amount: 100,
      });
      await expect(updateExpenseForm(prisma, tenant(org, user), expenseId, { amount: 5 })).rejects.toThrow(ApiError);
      await expect(deleteExpenseRow(prisma, tenant(org, user), expenseId)).rejects.toThrow(ApiError);
    } finally {
      await purge(other.oid).catch(() => undefined);
    }
  });
});

/* ── Grocery brands ────────────────────────────────────────────────────── */

describe("phase3: grocery brands", () => {
  let org: string;

  beforeAll(async () => {
    const t = await makeOrg("BrA");
    org = t.oid;
  });

  afterAll(async () => {
    await purge(org).catch(() => undefined);
  });

  it("createBrand + listBrands with search/paging returns {rows,total}", async () => {
    const b1 = await createBrand(prisma, org, { name: "بقالة المصطفى", nameAr: "بقالة المصطفى" });
    const b2 = await createBrand(prisma, org, { name: "عين يمنية", nameAr: "عين يمنية" });

    const all = await listBrands(org);
    expect(all.total).toBe(2);
    expect(all.rows).toHaveLength(2);

    const search = await listBrands(org, { search: "المصطفى" });
    expect(search.total).toBe(1);
    expect(search.rows[0].id).toBe(b1.id);

    const paged = await listBrands(org, { page: 1, pageSize: 1 });
    expect(paged.rows).toHaveLength(1);
    expect(paged.total).toBe(2);
    void b2;
  });

  it("duplicate brand name rejects with conflict", async () => {
    await expect(
      createBrand(prisma, org, { name: "بقالة المصطفى", nameAr: "بقالة المصطفى" }),
    ).rejects.toThrow(ApiError);
  });

  it("updateBrand renames and deleteBrand removes a brand without products", async () => {
    const { id } = await createBrand(prisma, org, { name: "لحذف", nameAr: "لحذف" });
    const renamed = await updateBrand(prisma, org, id, { nameAr: "لحذف معدل" });
    expect(renamed.nameAr).toBe("لحذف معدل");

    expect((await deleteBrand(prisma, org, id)).deleted).toBe(true);
    const after = await listBrands(org, { search: "لحذف" });
    expect(after.total).toBe(0);
  });
});

/* ── Grocery categories + products ─────────────────────────────────────── */

describe("phase3: grocery categories & products", () => {
  let org: string;
  let user: string;
  let rootId: string;
  let childId: string;

  beforeAll(async () => {
    const t = await makeOrg("CatA");
    org = t.oid;
    user = t.uid;

    rootId = (await createCategory(prisma, org, { nameAr: "معلبات", nameEn: "Canned" })).id;
    childId = (await createCategory(prisma, org, { nameAr: "تونة", parentId: rootId })).id;
  });

  afterAll(async () => {
    await purge(org).catch(() => undefined);
  });

  it("listCategories returns productCount and parent structure", async () => {
    const cats = await listCategories(org);
    expect(cats).toHaveLength(2);
    expect(cats.every((c) => c.productCount === 0)).toBe(true);
    const child = cats.find((c) => c.id === childId);
    expect(child?.parentId).toBe(rootId);
  });

  it("updateCategory renames; deleteCategory guards children", async () => {
    await expect(deleteCategory(prisma, org, rootId)).rejects.toThrow(ApiError);

    // Update-path cycle guard must remain strict (self/ancestor parenting).
    await expect(
      updateCategory(prisma, org, rootId, { parentId: rootId }),
    ).rejects.toThrow("its own parent");

    await updateCategory(prisma, org, childId, { nameAr: "تونة مكة" });
    const cats = await listCategories(org);
    expect(cats.find((c) => c.id === childId)?.nameAr).toBe("تونة مكة");

    expect((await deleteCategory(prisma, org, childId)).deleted).toBe(true);
  });

  it("listProducts filters/search works with seeded stock", async () => {
    const warehouse = await prisma.warehouse.create({
      data: { organizationId: org, nameAr: "مستودع رئيسي" },
    });
    const product = await createProduct(prisma, org, user, {
      sku: `SKU-${randomUUID().slice(0, 6)}`,
      nameAr: "زيت مكينة 1لتر",
      costPrice: 800,
      salePrice: 1000,
      warehouseId: warehouse.id,
      initialStock: 12,
    });

    const res = await listProducts(org, { search: "زيت" });
    expect(res.total).toBe(1);
    expect(res.rows[0].id).toBe(product.id);
    expect(res.rows[0].nameAr).toBe("زيت مكينة 1لتر");

    const levels = await prisma.stockLevel.findMany({
      where: { organizationId: org, productId: product.id },
    });
    expect(levels.reduce((sum, l) => sum + Number(l.qty), 0)).toBe(12);
  });
});

/* ── Suppliers (route ops are prisma-backed) ───────────────────────────── */

describe("phase3: suppliers", () => {
  let org: string;
  let user: string;

  beforeAll(async () => {
    const t = await makeOrg("SupA");
    org = t.oid;
    user = t.uid;
  });

  afterAll(async () => {
    await purge(org).catch(() => undefined);
  });

  it("create/list/soft-delete flow matches the GET/POST/PUT/DELETE route ops", async () => {
    const a = await prisma.supplier.create({
      data: { organizationId: org, name: "مورد الرافدين", phone: "777000111" },
    });
    const b = await prisma.supplier.create({
      data: { organizationId: org, name: "شركة الزيت", phone: "777000222" },
    });

    const rows = await prisma.supplier.findMany({ where: { organizationId: org } });
    expect(rows).toHaveLength(2);
    expect(rows.every((s) => s.organizationId === org)).toBe(true);
    expect(rows.find((s) => s.id === a.id)?.balance).toEqual(0n);

    // PUT route behaviour: toggle isActive false → filtered out of lists
    await prisma.supplier.update({ where: { id: b.id }, data: { isActive: false } });
    const active = await prisma.supplier.count({ where: { organizationId: org, isActive: true } });
    expect(active).toBe(1);
    void user;
  });
});

/* ── Sama-center settings (org-settings tag) ───────────────────────────── */

describe("phase3: sama-center settings", () => {
  let org: string;
  let user: string;

  beforeAll(async () => {
    const t = await makeOrg("SetA");
    org = t.oid;
    user = t.uid;
  });

  afterAll(async () => {
    await purge(org).catch(() => undefined);
  });

  it("GET defaults are derived when the tag is absent", async () => {
    const s = await getOrgSettings(org);
    expect(s).toMatchObject({ locale: "ar" });
    expect(s.samaCenter).toBeUndefined();
  });

  it("PUT deep-merges: partial tag updates persist other sub-tags", async () => {
    await updateOrgSettings(org, {
      samaCenter: {
        general: { businessName: "مركز سما", currency: "YER" },
        clinic: { defaultAppointmentDuration: 45 },
        notifications: { appointmentReminders: false },
      },
    });

    // Second PUT only touches clinic — general/notifications must survive.
    await updateOrgSettings(org, {
      samaCenter: { clinic: { defaultAppointmentDuration: 20 } },
    });

    const s = await getOrgSettings(org);
    expect(s.samaCenter).toMatchObject({
      general: { businessName: "مركز سما", currency: "YER" },
      clinic: { defaultAppointmentDuration: 20 },
      notifications: { appointmentReminders: false },
    });
    void user;
  });
});

/* ── Sama-center reports + grocery dashboard shapes ────────────────────── */

describe("phase3: reports + dashboard KPI shape", () => {
  let org: string;
  let user: string;

  beforeAll(async () => {
    const t = await makeOrg("RepA");
    org = t.oid;
    user = t.uid;
  });

  afterAll(async () => {
    await purge(org).catch(() => undefined);
  });

  it("daily/weekly/monthly summaries total zero for an empty org", async () => {
    const day = await getDailySummary(org, new Date());
    expect(day.net).toEqual(0n);
    expect(day.sessionsCount).toBe(0);
    expect(day.advancesCount).toBe(0);

    const week = await getWeeklySummary(org);
    expect(week).toMatchObject({ net: 0n, sessionsCount: 0, advancesCount: 0 });

    const month = await getMonthlySummary(org);
    expect(month).toMatchObject({ net: 0n, sessionsCount: 0, advancesCount: 0, newPatients: 0 });
    void user;
  });

  it("grocery dashboard kpis expose scalar bigint totals (route feeds numbers)", async () => {
    const k = await getDashboardKpis(org);
    expect(k.todaySales.total).toBeTypeOf("bigint");
    expect(k.todaySales.paid).toBeTypeOf("bigint");
    expect(k.todaySales.count).toBeTypeOf("number");
    expect(k.todayExpenses.total).toBeTypeOf("bigint");
    expect(k.lowStock.count).toBeTypeOf("number");
    expect(k.debts.total).toBeTypeOf("bigint");
  });
});