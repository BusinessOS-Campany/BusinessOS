import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { processOutboxBatch } from "@/core/workflows/worker";

/**
 * The outbox worker is a shared queue, and these two tests pin what that means
 * for anyone draining it.
 *
 * `processOutboxBatch` used to select every org's pending events, so two suites
 * running in parallel both drained the same table. One suite's `afterAll` then
 * deleted rows the other was midway through updating, and Prisma raised P2025
 * ("No record was found for an update") out of the batch. It surfaced as two
 * unrelated-looking failures in `m6-workflows`, passed when that file ran alone,
 * and would have been very easy to dismiss as noise.
 */

let userId = "";
const orgIds: string[] = [];

async function makeOrg(): Promise<string> {
  const id = randomUUID();
  orgIds.push(id);
  await prisma.organization.create({
    data: { id, name: "Worker Scope Org", slug: `ws-${randomUUID().slice(0, 12)}` },
  });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: id, userId, role: "owner" },
  });
  return id;
}

/** A pending event for `orgId`, with no rule to match so the worker just completes it. */
async function seedEvent(orgId: string, tag: string): Promise<string> {
  const id = randomUUID();
  await prisma.outboxEvent.create({
    data: {
      id,
      organizationId: orgId,
      eventType: "worker.scope.test",
      dedupeKey: `worker-scope-${tag}-${randomUUID().slice(0, 8)}`,
      entityId: tag,
      payload: { eventType: "worker.scope.test" },
    },
  });
  return id;
}

const statusOf = (id: string) =>
  prisma.outboxEvent.findUniqueOrThrow({ where: { id } }).then((e) => e.status);

beforeAll(async () => {
  userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: {
      id: userId,
      name: "Worker Scope Tester",
      emailVerified: false,
      email: `ws-${randomUUID().slice(0, 8)}@test.local`,
    },
  });
});

afterAll(async () => {
  for (const oid of orgIds) {
    for (const t of ["workflowExecution", "outboxEvent", "workflowRule", "webhookEndpoint", "notification"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[t].deleteMany({ where: { organizationId: oid } });
    }
    await prisma.member.deleteMany({ where: { organizationId: oid } });
    await prisma.organization.delete({ where: { id: oid } });
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
});

describe("draining the outbox for one org", () => {
  it("leaves another org's pending events alone", async () => {
    const mine = await makeOrg();
    const theirs = await makeOrg();

    const myEvent = await seedEvent(mine, "mine");
    const theirEvent = await seedEvent(theirs, "theirs");

    const result = await processOutboxBatch(prisma, mine);

    expect(result.processed).toBe(1);
    expect(await statusOf(myEvent)).toBe("completed");
    // The whole point: an unscoped drain would have completed this one too.
    expect(await statusOf(theirEvent)).toBe("pending");
  });

  it("counts only the scoped org's events", async () => {
    const mine = await makeOrg();
    await seedEvent(mine, "a");
    await seedEvent(mine, "b");

    const result = await processOutboxBatch(prisma, mine);
    expect(result.processed).toBe(2);
  });
});

describe("an event that disappears mid-flight", () => {
  it("does not crash the batch", async () => {
    const org = await makeOrg();
    await seedEvent(org, "vanishing");

    // Stands in for the real race: a concurrent worker, or an org deleted while
    // its events were queued, removes the row between our SELECT and our UPDATE.
    const gone = Object.assign(new Error("An operation failed because it depends on one or more records that were required but not found."), {
      code: "P2025",
    });
    const txHost = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === "outboxEvent") {
          return new Proxy(target.outboxEvent, {
            get(inner, innerProp) {
              if (innerProp === "update") {
                return () => Promise.reject(gone);
              }
              const value = Reflect.get(inner, innerProp, inner);
              return typeof value === "function" ? value.bind(inner) : value;
            },
          });
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    // Must resolve rather than reject: one vanished row must not cost the batch
    // the other 49 events.
    const result = await processOutboxBatch(txHost as never, org);
    expect(result.processed + result.failed).toBe(1);
  });

  it("still reports a real failure rather than swallowing it", async () => {
    const org = await makeOrg();
    await seedEvent(org, "genuine-failure");

    const boom = Object.assign(new Error("connection reset"), { code: "P1001" });
    const txHost = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === "outboxEvent") {
          return new Proxy(target.outboxEvent, {
            get(inner, innerProp) {
              if (innerProp === "update") {
                return () => Promise.reject(boom);
              }
              const value = Reflect.get(inner, innerProp, inner);
              return typeof value === "function" ? value.bind(inner) : value;
            },
          });
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    // P2025 means the row is gone and there is nothing to record. Anything else
    // is a real error and must stay visible, so the batch surfaces it.
    await expect(processOutboxBatch(txHost as never, org)).rejects.toThrow("connection reset");
  });
});