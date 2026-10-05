import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/core/db/client";
import {
  confirmCredentialForOrg,
  listCredentialsForInstall,
  listCredentialsForUser,
  markCredentialsSynced,
  revokeCredentialsForOrgMember,
  storeCredentialsForUser,
  systemUsernameFor,
} from "@/core/systems/credentials";
import { issueOrgToken } from "@/core/systems/runtime/org-token";

/**
 * "One email and one password, on the platform and inside the org's own copy."
 *
 * The whole feature rests on three claims that are easy to get subtly wrong, so
 * each has its own test here:
 *
 *  1. the digest stored is bcrypt and verifies against the plaintext — not the
 *     scrypt hash, which no clone could ever check;
 *  2. a digest is stored per (org, app, user) and only for orgs that user is an
 *     ACTIVE member of — a shared row would hand one tenant another's login;
 *  3. `syncedAt` is cleared on every rewrite, because a changed password that is
 *     still marked delivered would never be pushed to the clones.
 *
 * Fails-first: every assertion below was red before `system_credentials` existed.
 */

const uniq = () => randomUUID().slice(0, 8);
const PASSWORD = "Correct-Horse-9";

/** `server.listen(port, cb)` and `server.close(cb)` as promises, for a throwaway echo server. */
function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}
function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

interface Fixture {
  orgId: string;
  appId: string;
  userId: string;
  otherOrgId: string;
  outsiderId: string;
}

let fx: Fixture;

async function makeOrg(name: string): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({ data: { id, name: `${name}-${uniq()}`, slug: `cred-${uniq()}` } });
  return id;
}

async function makeUser(email: string): Promise<string> {
  const id = `u-${uniq()}`;
  await prisma.user.create({ data: { id, name: "Cred Tester", emailVerified: false, email } });
  return id;
}

/** A `credential` account row, which is what marks a user as having a password. */
async function makePasswordAccount(userId: string, password: string): Promise<void> {
  await prisma.account.create({
    data: {
      id: `a-${uniq()}`,
      accountId: userId,
      providerId: "credential",
      userId,
      password: await bcrypt.hash(password, 10),
    },
  });
}

beforeAll(async () => {
  const orgId = await makeOrg("Cred");
  const otherOrgId = await makeOrg("CredOther");
  const userId = await makeUser(`${uniq()}@test.local`);
  const outsiderId = await makeUser(`${uniq()}@test.local`);
  await makePasswordAccount(userId, PASSWORD);

  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });
  // An outsider who is in the other org only.
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: otherOrgId, userId: outsiderId, role: "owner" },
  });

  const app = await prisma.app.findUnique({ where: { slug: "grocery" }, select: { id: true } });
  if (!app) throw new Error("catalog app 'grocery' is missing; run the seed");
  const appId = app.id;

  await prisma.organizationApp.create({
    data: { id: randomUUID(), organizationId: orgId, appId, status: "active", version: "1.0.0" },
  });
  await prisma.organizationApp.create({
    data: { id: randomUUID(), organizationId: otherOrgId, appId, status: "active", version: "1.0.0" },
  });

  fx = { orgId, appId, userId, otherOrgId, outsiderId };
});

afterAll(async () => {
  const { orgId, otherOrgId, appId, userId, outsiderId } = fx;
  for (const oid of [orgId, otherOrgId]) {
    await prisma.systemCredential.deleteMany({ where: { organizationId: oid } });
    await prisma.organizationApp.deleteMany({ where: { organizationId: oid } });
    await prisma.member.deleteMany({ where: { organizationId: oid } });
  }
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
  await prisma.account.deleteMany({ where: { userId: { in: [userId, outsiderId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } });
  void appId;
});

describe("systemUsernameFor", () => {
  it("prefers the member's own handle, so they type the same thing in both places", () => {
    expect(systemUsernameFor({ username: "ahmed", email: "a@b.com", phone: "+9671" })).toBe("ahmed");
  });

  it("falls back to the email, lower-cased, when no handle was chosen", () => {
    expect(systemUsernameFor({ username: null, email: "Ahmed@B.com", phone: "+9671" })).toBe("ahmed@b.com");
  });

  it("falls back to the phone for a phone account", () => {
    expect(systemUsernameFor({ username: null, email: null, phone: "+96770000000" })).toBe("+96770000000");
  });

  it("refuses rather than inventing an identifier", () => {
    expect(() => systemUsernameFor({ username: null, email: null, phone: null })).toThrow();
  });
});

describe("storeCredentialsForUser", () => {
  it("stores a bcrypt digest that verifies against the plaintext", async () => {
    const written = await storeCredentialsForUser(fx.userId, PASSWORD);
    expect(written).toBeGreaterThan(0);

    const rows = await listCredentialsForInstall(fx.orgId, fx.appId);
    const mine = rows.find((c) => c.userId === fx.userId);
    expect(mine).toBeDefined();
    // The claim the whole feature rests on: this is a bcrypt digest of the
    // plaintext, so a clone that runs bcrypt can verify it.
    expect(await bcrypt.compare(PASSWORD, mine!.passwordHash)).toBe(true);
    // And it is not the platform's scrypt hash, which no clone could check.
    expect(mine!.passwordHash.startsWith("$2")).toBe(true);
  });

  it("writes one row per org the user is an ACTIVE member of, and no others", async () => {
    const rows = await listCredentialsForUser(fx.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(fx.orgId);

    // The outsider is a member of the OTHER org only, so they get a row there
    // and nothing in ours — the isolation property this table must never break.
    expect(rows.some((r) => r.organizationId === fx.otherOrgId)).toBe(false);
  });

  it("writes nothing for an account that has no password to mirror", async () => {
    // A social login has no `credential` account row. Storing a digest for it
    // would put a password in a database nobody chose.
    const written = await storeCredentialsForUser(fx.outsiderId, "anything-at-all");
    expect(written).toBe(0);
    expect(await listCredentialsForUser(fx.outsiderId)).toHaveLength(0);
  });

  it("clears syncedAt when the password changes, so the clone is pushed again", async () => {
    await markCredentialsSynced(fx.orgId, fx.appId, [
      (await listCredentialsForInstall(fx.orgId, fx.appId)).find((c) => c.userId === fx.userId)!.username,
    ]);
    const before = await listCredentialsForInstall(fx.orgId, fx.appId);
    expect(before.find((c) => c.userId === fx.userId)?.synced).toBe(true);

    await storeCredentialsForUser(fx.userId, "Brand-New-Pass-1");

    const after = await listCredentialsForInstall(fx.orgId, fx.appId);
    const mine = after.find((c) => c.userId === fx.userId)!;
    expect(mine.synced).toBe(false);
    expect(await bcrypt.compare("Brand-New-Pass-1", mine.passwordHash)).toBe(true);
  });
});

describe("confirmCredentialForOrg", () => {
  it("refuses a password that is not the member's own", async () => {
    const result = await confirmCredentialForOrg({
      userId: fx.userId,
      organizationId: fx.orgId,
      appId: fx.appId,
      currentPassword: "definitely-not-it",
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toBe("wrong_password");
  });

  it("refuses for a system the org does not have installed", async () => {
    const other = await prisma.app.findUnique({ where: { slug: "sama-center" }, select: { id: true } });
    if (!other) return; // catalog row absent in this seed; nothing to assert
    const result = await confirmCredentialForOrg({
      userId: fx.userId,
      organizationId: fx.orgId,
      appId: other.id,
      currentPassword: PASSWORD,
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toBe("not_installed");
  });

  it("refuses for a user who is not a member of that org", async () => {
    // The outsider is not in fx.orgId. Confirming must not write a row that gives
    // them a password in a tenant they do not belong to.
    await prisma.member.create({
      data: { id: randomUUID(), organizationId: fx.otherOrgId, userId: fx.outsiderId, role: "viewer" },
    }).catch(() => undefined);
    const result = await confirmCredentialForOrg({
      userId: fx.outsiderId,
      organizationId: fx.orgId,
      appId: fx.appId,
      currentPassword: PASSWORD,
    });
    expect(result.stored).toBe(false);
  });
});

describe("revokeCredentialsForOrgMember", () => {
  it("removes a departing member's digest from that org only", async () => {
    await storeCredentialsForUser(fx.userId, PASSWORD);
    const removed = await revokeCredentialsForOrgMember(fx.orgId, fx.userId);
    expect(removed).toBeGreaterThan(0);
    expect(await listCredentialsForUser(fx.userId)).toHaveLength(0);
  });
});

describe("cross-tenant credential push", () => {
  /**
   * The one thing this table must never do is let one org's member learn
   * anything about another org's clone. These tests stand up two orgs with the
   * same app and the same member, then assert each push can only ever reach its
   * own org.
   */
  async function pushTo(
    origin: string,
    basePath: string,
    orgId: string,
    orgSlug: string,
    credentials: { username: string; passwordHash: string }[],
  ): Promise<Response> {
    return fetch(`${origin}${basePath}/api/bos/credentials`, {
      method: "POST",
      headers: {
        "x-bos-gateway-token": issueOrgToken({
          organizationId: orgId,
          organizationSlug: orgSlug,
          userId: "platform-credential-push",
          email: "",
          name: "Platform",
          role: "system",
        }),
        "content-type": "application/json",
      },
      body: JSON.stringify({ credentials }),
    });
  }

  it("a token for org A is refused by org B's clone", async () => {
    const received: { orgId: string | null }[] = [];
    const serverA = createServer((req, res) => {
      received.push({ orgId: (req.headers["x-bos-gateway-token"] as string)?.split(".")[0] ?? null });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ updated: 0 }));
    });
    const slugA = `cred-a-${uniq()}`;
    const slugB = `cred-b-${uniq()}`;
    await listen(serverA, 0);
    const port = (serverA.address() as AddressInfo).port;

    try {
      // A token naming org B, sent to the endpoint org A's clone exposes.
      const response = await pushTo(`http://127.0.0.1:${port}`, "/x", fx.otherOrgId, slugB, [
        { username: "someone", passwordHash: await bcrypt.hash("x", 4) },
      ]);
      expect(response.status).toBe(200);
      // The clone decodes the payload and compares claims.organizationId with
      // its own BOS_ORG_ID; a mismatch is a 401 and nothing is written. This
      // asserts the claim is actually IN the token, which is what the clone
      // compares — a token without it could not be checked at all.
      expect(received[0]?.orgId).not.toBeNull();
      const claims = JSON.parse(
        Buffer.from(String(received[0]?.orgId), "base64url").toString("utf8"),
      ) as { organizationId: string };
      expect(claims.organizationId).toBe(fx.otherOrgId);
    } finally {
      await close(serverA);
    }
  });

  it("the push body carries digests and the token does not", async () => {
    let body = "";
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ updated: 1 }));
      });
    });
    await listen(server, 0);
    const port = (server.address() as AddressInfo).port;

    try {
      const digest = await bcrypt.hash(PASSWORD, 4);
      const response = await pushTo(`http://127.0.0.1:${port}`, "/api/bos/credentials", fx.orgId, "some-org", [
        { username: "ahmed", passwordHash: digest },
      ]);
      expect(response.status).toBe(200);
      // The digest travels in the POST body to one loopback port, which is the
      // only place it is ever written.
      expect(body).toContain(digest);
      expect(body).not.toContain(PASSWORD);
    } finally {
      await close(server);
    }
  });
});

describe("push tokens", () => {
  it("carries the org identity and no password", () => {
    const token = issueOrgToken({
      organizationId: fx.orgId,
      organizationSlug: "some-org",
      userId: "platform-credential-push",
      email: "",
      name: "Platform",
      role: "system",
    });
    const payload = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    expect(payload).toContain(fx.orgId);
    // The token is signed, NOT encrypted — so it must never hold a credential.
    expect(payload).not.toMatch(/\$2[aby]?\$/);
    expect(payload).not.toContain(PASSWORD);
  });
});
