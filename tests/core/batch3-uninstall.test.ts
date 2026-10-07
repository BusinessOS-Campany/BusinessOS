import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import { uninstallSystemForOrg, installApp } from "@/core/apps/service";

/**
 * BATCH 3 — customer-facing uninstall.
 *
 * `uninstallApp` deleted the install row and nothing else, so an org's Node
 * process kept running against a system it no longer owned. `uninstallSystemForOrg`
 * stops the runtime first (injected here so no process is spawned), then removes
 * the row, and reports that the files and database are deliberately kept.
 */

let orgId = "";
let orgSlug = "";
let userId = "";
let appId = "";

const tag = () => randomUUID().slice(0, 8);

beforeAll(async () => {
  userId = `u-${tag()}`;
  await prisma.user.create({
    data: { id: userId, name: "Uninstall Tester", emailVerified: false, email: `${tag()}@test.local` },
  });
  orgId = randomUUID();
  orgSlug = `b3-${tag()}`;
  await prisma.organization.create({ data: { id: orgId, name: "B3 Org", slug: orgSlug } });
  appId = (await prisma.app.findUnique({ where: { slug: "dental" }, select: { id: true } }))!.id;
});

afterAll(async () => {
  if (orgId) {
    await prisma.organizationApp.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
});

async function installDental(): Promise<void> {
  await prisma.organizationApp.create({
    data: { id: randomUUID(), organizationId: orgId, appId, version: "1.0.0", status: "active" },
  });
}

describe("BATCH 3: uninstallSystemForOrg", () => {
  it("stops the org's runtime, then removes the install row", async () => {
    await installDental();
    const stop = vi.fn(() => true);

    const result = await uninstallSystemForOrg(orgId, "dental", stop);

    expect(stop).toHaveBeenCalledWith(orgSlug, "dental");
    expect(result).toEqual({ stopped: true, filesKept: true, databaseKept: true });
    const row = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId: orgId, appId } },
      select: { id: true },
    });
    expect(row).toBeNull();
  });

  it("reports stopped=false when no runtime was running", async () => {
    await installDental();
    const stop = vi.fn(() => false);
    const result = await uninstallSystemForOrg(orgId, "dental", stop);
    expect(result.stopped).toBe(false);
  });

  it("404s when the system is not installed in the org", async () => {
    await expect(uninstallSystemForOrg(orgId, "dental", () => true)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("404s for an unknown app slug", async () => {
    await expect(uninstallSystemForOrg(orgId, "does-not-exist", () => true)).rejects.toMatchObject({
      status: 404,
    });
  });
});

/**
 * The second write race: two installs both see no row and both try to create it.
 * The unique constraint must turn the loser into the winner's result, not a raw
 * Prisma error, and the org must end up with exactly one install.
 */
describe("BATCH 3: concurrent install", () => {
  it("settles two simultaneous installs into one row, with no error", async () => {
    // Any active catalog system WITHOUT a source folder: the clone is then a
    // fast no-op, so the test exercises only the row-insert race.
    const { listSystemSources } = await import("@/core/org-vault/system-sources");
    const sourced = new Set(listSystemSources());
    const target = (await prisma.app.findMany({ where: { isActive: true }, select: { id: true, slug: true } }))
      .find((row) => !sourced.has(row.slug));
    expect(target, "expected an active catalog app with no system/ source").toBeTruthy();

    const [a, b] = await Promise.all([
      installApp(orgId, { appId: target!.id }),
      installApp(orgId, { appId: target!.id }),
    ]);

    expect(a.id).toBe(b.id);
    const rows = await prisma.organizationApp.count({
      where: { organizationId: orgId, appId: target!.id },
    });
    expect(rows).toBe(1);
  });
});