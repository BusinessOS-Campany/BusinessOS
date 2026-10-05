import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";

/**
 * Post-auth landing checks, using the path a first-time Google user actually
 * takes.
 *
 * Google itself cannot be driven headlessly (it needs a real consent screen),
 * but the callbackURL the Google button posts to is `/auth/landing`, and the
 * state it arrives in is fully reproducible: a user row whose `name` came from
 * the provider, and *no* membership row. So a plain email sign-up plus a
 * navigation to `/auth/landing` exercises the identical server path.
 *
 * The Arabic display name is deliberate. Real Google accounts in this
 * deployment are Arabic-named, and that is what produced slugs the `/{org}`
 * route could not match - an org created but unreachable at its own URL.
 */
const BASE = "http://localhost:3100";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PW = "Sodb!123456789";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

interface Probe {
  email: string;
  name: string;
  userId: string;
  orgId?: string;
}

async function api(path: string, body: unknown): Promise<number> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, referer: `${BASE}/signup` },
    body: JSON.stringify(body),
  });
  return r.status;
}

/** A signed-in user with exactly the post-OAuth state: name from provider, no org. */
async function makeSocialLikeUser(stamp: number, name: string): Promise<Probe> {
  const email = `sodb+${stamp}+${Math.random().toString(36).slice(2, 7)}@probe.local`;
  const status = await api("/api/auth/sign-up/email", { email, password: PW, name });
  if (status >= 400) throw new Error(`sign-up failed: ${status}`);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("probe user not found after sign-up");
  return { email, name, userId: user.id };
}

async function landAs(page: import("puppeteer-core").Page, probe: Probe, visited: string[]) {
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) visited.push(new URL(f.url()).pathname);
  });
  await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (email: string, password: string) => {
    await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }, probe.email, PW);
  await page.goto(`${BASE}/auth/landing`, { waitUntil: "networkidle2" });
  return new URL(page.url()).pathname;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox"],
  });
  const orgIds: string[] = [];
  try {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
    await page.setViewport({ width: 1440, height: 1000 });

    // --- The sign-in page still offers Google, and it still targets /auth/landing.
    await page.goto(`${BASE}/signin`, { waitUntil: "networkidle2" });
    const hasGoogle = await page.evaluate(() =>
      // The button is an inline SVG plus an Arabic label, so there is no
      // "google" text to match. #4285F4 is the Google blue in that SVG.
      Array.from(document.querySelectorAll("button")).some((b) =>
        b.querySelector('path[fill="#4285F4"]') !== null,
      ),
    );
    check("sign-in page offers Google", hasGoogle);

    // --- Scenario 1: brand-new Arabic-named user, no membership (the Google case).
    const stamp = Date.now();
    const arabic = await makeSocialLikeUser(stamp, "حسان الرفاعي");
    const visited1: string[] = [];
    const hops1: string[] = [];
    page.on("response", (r) => {
      if (r.request().resourceType() === "document") {
        hops1.push(new URL(r.url()).pathname);
      }
    });
    const path1 = await landAs(page, arabic, visited1);

    check(
      "a first-time social user is not dumped in the org picker",
      !visited1.includes("/select-org"),
      `visited=${visited1.join(" -> ")}`,
    );
    check(
      "lands on /{org}/profile",
      /^\/[^/]+\/profile$/.test(path1),
      `final=${path1}`,
    );
    // A server-side redirect() hop does not fire framenavigated - the router
    // follows it internally - so provisioning is proved by the document request
    // and the committed audit row, not by a transient URL.
    check(
      "went through the provisioning route",
      hops1.includes("/auth/complete-org"),
      `documents=${hops1.join(" -> ")}`,
    );

    const slug = path1.split("/")[1] || "";
    check("the slug is ASCII, so the route can match it", /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug), `slug=${slug}`);

    const org = await prisma.organization.findFirst({ where: { slug } });
    if (org) orgIds.push(org.id);
    check("the org is named after the Google account name", org?.name === arabic.name, `name=${org?.name} expected=${arabic.name}`);

    const member = org
      ? await prisma.member.findFirst({ where: { organizationId: org.id, userId: arabic.userId } })
      : null;
    check("the user owns the provisioned org", member?.role === "owner", `role=${member?.role}`);

    const audit = org
      ? await prisma.auditLog.findFirst({
          where: { organizationId: org.id, action: "platform.tenant.created" },
        })
      : null;
    check(
      "the provisioning transaction committed an audit row",
      Boolean(audit),
      `action=${audit?.action ?? "none"}`,
    );

    // The real point of the ASCII slug: the URL it advertises must actually load.
    const profileResponse = await page.goto(`${BASE}${path1}`, { waitUntil: "networkidle2" });
    check("the advertised org URL is reachable", profileResponse?.status() === 200, `status=${profileResponse?.status()}`);
    const showsName = await page.evaluate(() => document.body.innerText.includes("حسان الرفاعي"));
    check("the profile shows the account name", showsName);

    // --- Scenario 2: a returning single-org user goes to their org, not a picker.
    const returning = await makeSocialLikeUser(stamp, "Second User");
    const org2 = await prisma.organization.create({
      data: { id: randomUUID(), name: "Returning Co", slug: `returning-co-${stamp}`, status: "active" },
    });
    orgIds.push(org2.id);
    await prisma.member.create({
      data: { id: randomUUID(), organizationId: org2.id, userId: returning.userId, role: "owner" },
    });
    const visited2: string[] = [];
    const path2 = await landAs(page, returning, visited2);
    check(
      "a returning single-org user goes straight to that org's profile",
      path2 === `/${org2.slug}/profile`,
      `final=${path2} visited=${visited2.join(" -> ")}`,
    );

    // --- Scenario 3: two orgs still get the picker (unchanged behaviour).
    const multi = await makeSocialLikeUser(stamp, "Multi User");
    const multiIds: string[] = [];
    for (const n of [1, 2]) {
      const o = await prisma.organization.create({
        data: { id: randomUUID(), name: `Multi ${n}`, slug: `multi-${stamp}-${n}`, status: "active" },
      });
      multiIds.push(o.id);
      orgIds.push(o.id);
      await prisma.member.create({
        data: { id: randomUUID(), organizationId: o.id, userId: multi.userId, role: "owner" },
      });
    }
    const visited3: string[] = [];
    const path3 = await landAs(page, multi, visited3);
    check("a genuine multi-org user still gets the picker", path3 === "/select-org", `final=${path3} orgs=${multiIds.length}`);

    check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await page.close();
  } finally {
    await browser.close();
    for (const id of orgIds) {
      await prisma.organizationApp.deleteMany({ where: { organizationId: id } });
      await prisma.member.deleteMany({ where: { organizationId: id } });
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { email: { contains: "@probe.local" } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed}/${passed + failures.length} checks passed`);
  if (failures.length) {
    console.log("failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
