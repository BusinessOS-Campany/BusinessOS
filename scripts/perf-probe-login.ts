/**
 * Perf-probe helper: provisions a throwaway owner + org directly (skipping
 * vault provisioning) and prints the session cookie for HTTP measurement.
 * Usage: npx tsx scripts/perf-probe-login.ts [email]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Next.js loads .env.local for the app; a bare `tsx` script does not.
for (const file of [".env.local", ".env"]) {
  try {
    for (const raw of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] === undefined) {
        process.env[key] = line.slice(eq + 1).trim();
      }
    }
  } catch {
    // optional
  }
}

const email = process.argv[2] ?? `perfprobe${Date.now()}@bos.local`;
const password = "PerfProbe12345!";

async function main() {
  const { prisma } = await import("../src/core/db/client");
  const { auth } = await import("../src/core/auth/server");

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  let userId = existing?.id;
  if (!userId) {
    const created = await auth.api.signUpEmail({ body: { email, password, name: "Perf Probe" } });
    userId = created.user.id;
  }

  const slug = `perfprobe-${userId.slice(0, 8)}`;
  let org = await prisma.organization.findFirst({
    where: { slug },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: randomUUID(),
        name: "Perf Probe Org",
        slug,
        status: "active",
        settings: { modulesEnabled: [] } as never,
      },
      select: { id: true },
    });
  }
  const member = await prisma.member.findFirst({
    where: { organizationId: org.id, userId },
    select: { id: true },
  });
  if (!member) {
    await prisma.member.create({
      data: { id: randomUUID(), organizationId: org.id, userId, role: "owner" },
    });
  }

  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const cookies = res.headers.getSetCookie();
  const sessionCookie = cookies.find((c) => c.startsWith("bos.session_token="));
  if (!sessionCookie) {
    console.log("COOKIES:", cookies.map((c) => c.split("=")[0]).join(","));
    throw new Error("no session cookie");
  }
  console.log(`EMAIL=${email}`);
  console.log(`PASSWORD=${password}`);
  console.log(`ORG_SLUG=${slug}`);
  console.log(`SESSION_COOKIE=${sessionCookie.split(";")[0]}`);
  await prisma.$disconnect();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
