import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { requestSystemForTenant, withdrawSystemRequest } from "@/core/apps/service";

/**
 * BATCH 4 — a member can withdraw a pending install request.
 *
 * The approvals queue only shrank when an admin decided, so a customer who
 * changed their mind had no way to say so. `withdrawSystemRequest` deletes the
 * `pending` row (only one can exist per org+app) and writes an audit entry, so
 * the card returns to "installable" without waiting for a decision.
 */
const mkSlug = () => `b4-${randomUUID().slice(0, 8)}`;

let orgId = "";
let userId = "";
const appIds: string[] = [];
const requestRoute = "src/app/api/v1/apps/[slug]/request/route.ts";

async function makeApp(slug: string): Promise<string> {
  const row = await prisma.app.create({
    data: {
      id: randomUUID(),
      slug,
      name: "B4 Test System",
      nameAr: "نظام اختبار",
      description: "d",
      descriptionAr: "و",
      icon: "box",
      category: "test",
      version: "1.0.0",
      routePrefix: "/app/b4-test",
    },
    select: { id: true },
  });
  appIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { id: userId, name: "B4 Tester", emailVerified: false, email: `${mkSlug()}@test.local` },
  });
  orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "B4", slug: mkSlug() } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" } });
});

afterAll(async () => {
  if (orgId) {
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationApp.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: orgId } });
    await prisma.member.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
  }
  for (const id of appIds) {
    await prisma.organizationApp.deleteMany({ where: { appId: id } });
    await prisma.organizationAppRequest.deleteMany({ where: { appId: id } });
    await prisma.app.delete({ where: { id } }).catch(() => undefined);
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
});

describe("BATCH 4: withdrawSystemRequest", () => {
  it("removes a pending request and audits the withdrawal", async () => {
    const slug = mkSlug();
    const appId = await makeApp(slug);

    const requested = await requestSystemForTenant(orgId, { slug, userId });
    expect(requested.state).toBe("pending");
    expect(requested.requestId).toBeTruthy();

    const result = await withdrawSystemRequest(orgId, { slug, userId });
    expect(result.withdrawn).toBe(true);

    const rows = await prisma.organizationAppRequest.count({ where: { organizationId: orgId, appId } });
    expect(rows).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: "marketplace.app.withdrawn", entityId: appId },
      select: { id: true },
    });
    expect(audit).not.toBeNull();
  });

  it("lets the withdrawn system be requested again as a fresh queue entry", async () => {
    const slug = mkSlug();
    const appId = await makeApp(slug);

    await requestSystemForTenant(orgId, { slug, userId });
    await withdrawSystemRequest(orgId, { slug, userId });

    const again = await requestSystemForTenant(orgId, { slug, userId });
    expect(again.state).toBe("pending");
    expect(again.created).toBe(true);
    expect(await prisma.organizationAppRequest.count({ where: { organizationId: orgId, appId } })).toBe(1);
  });

  it("refuses when there is no pending request", async () => {
    const slug = mkSlug();
    await makeApp(slug);
    await expect(withdrawSystemRequest(orgId, { slug, userId })).rejects.toMatchObject({ status: 404 });
  });

  it("404s for an unknown system", async () => {
    await expect(withdrawSystemRequest(orgId, { slug: mkSlug(), userId })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("BATCH 4: withdraw route wiring", () => {
  const source = readFileSync(join(process.cwd(), requestRoute), "utf8");

  it("exposes a DELETE handler that withdraws rather than installs", () => {
    expect(source).toContain("export const DELETE");
    expect(source).toContain("withdrawSystemRequest(");
    expect(source).not.toContain("installSystemForOrg(");
  });

  it("gates the withdrawal on the same install permission that filed the request", () => {
    expect(source).toContain('systems: ["install"]');
  });
});