import "@/core/config/load-env";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/core/db/client";
import { tenantFilter, tenantOwn, assertOwned, hasPermission, requirePermission } from "@/core/db/tenant-guard";
import { writeAuditLog } from "@/core/audit/service";
import type { TenantContext } from "@/core/tenancy/context";

let orgA: string;
let orgB: string;
const cleanupIds: string[] = [];

async function makeOrg(): Promise<string> {
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: `org-${randomUUID().slice(0, 8)}`, slug: `t-${randomUUID().slice(0, 12)}` },
  });
  cleanupIds.push(org.id);
  return org.id;
}

function tenantFor(orgId: string): TenantContext {
  return { organizationId: orgId, userId: "test-user", role: "owner" };
}

beforeAll(async () => {
  orgA = await makeOrg();
  orgB = await makeOrg();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupIds } } });
  await prisma.$disconnect();
});

describe("tenant isolation", () => {
  it("scoped queries only ever return the caller's organization rows", async () => {
    const tA = tenantFor(orgA);
    await prisma.$transaction([
      prisma.auditLog.create({
        data: { ...tenantOwn(tA), action: "test.created", entityType: "Test", entityId: "a-1" },
      }),
      prisma.auditLog.create({
        data: {
          ...tenantOwn(tenantFor(orgB)),
          action: "test.created",
          entityType: "Test",
          entityId: "b-1",
        },
      }),
    ]);

    const rowsA = await prisma.auditLog.findMany({ where: tenantFilter(tA, { entityType: "Test" }) });
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsA.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rowsA.some((r) => r.entityId === "b-1")).toBe(false);

    const rowsB = await prisma.auditLog.findMany({ where: tenantFilter(tenantFor(orgB), { entityType: "Test" }) });
    expect(rowsB.map((r) => r.entityId)).toContain("b-1");
    expect(rowsB.map((r) => r.entityId)).not.toContain("a-1");
  });

  it("assertOwned rejects rows from another organization", async () => {
    const foreign = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: orgB },
    });
    expect(() => assertOwned(foreign, tenantFor(orgA))).toThrow();
    expect(() => assertOwned(null, tenantFor(orgA))).toThrow();

    const own = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: orgA },
    });
    expect(() => assertOwned(own, tenantFor(orgA))).not.toThrow();
  });

  it("audit writes inside a transaction are atomic with the business change", async () => {
    const tA = tenantFor(orgA);
    await prisma.$transaction(async (tx) => {
      await writeAuditLog(tx, tA, {
        action: "test.atomic",
        entityType: "Test",
        after: { ok: true },
      });
      throw new Error("rollback on purpose");
    }).catch(() => undefined);

    const found = await prisma.auditLog.findFirst({ where: { organizationId: orgA, action: "test.atomic" } });
    expect(found).toBeNull();
  });
});

describe("permission catalog", () => {
  it("cashier cannot approve expenses; accountant can", () => {
    expect(hasPermission("cashier", { expenses: ["approve"] })).toBe(false);
    expect(hasPermission("accountant", { expenses: ["approve"] })).toBe(true);
  });

  it("manager can refund sales but cannot manage roles", () => {
    expect(hasPermission("manager", { sales: ["refund"] })).toBe(true);
    expect(hasPermission("manager", { roles: ["manage"] })).toBe(false);
  });

  it("viewer is read-only", () => {
    expect(hasPermission("viewer", { products: ["read"] })).toBe(true);
    expect(hasPermission("viewer", { products: ["create"] })).toBe(false);
    expect(hasPermission("viewer", { pos: ["operate"] })).toBe(false);
  });

  it("unknown roles are denied everything", () => {
    expect(hasPermission("superuser", { products: ["read"] })).toBe(false);
  });

  it("requirePermission throws the canonical 403 envelope error", () => {
    try {
      requirePermission(tenantFor(orgA) && { role: "cashier" }, { finance: ["manage"] });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as { status?: number }).status).toBe(403);
      expect((err as { code?: string }).code).toBe("FORBIDDEN");
    }
  });
});
