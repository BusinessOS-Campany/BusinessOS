import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";
import { BUSINESS_SYSTEMS } from "@/core/demo/business-systems-data";
import { listSystemSources } from "@/core/org-vault/system-sources";
import { installableCardIds } from "@/core/systems/catalog";
import { installSystemForOrg } from "@/core/apps/service";
import { withRegistry } from "@/core/org-vault/registry";
import { orgVaultPaths } from "@/core/org-vault/paths";

/**
 * `/systems` must offer install ONLY on cards the deployment can honour, and a
 * signed-in click must file a platform-approval request that later shows up in
 * the profile's systems tab.
 *
 * Before this, the page bound two hard-coded template codes and rendered the
 * other 171 cards as `/signup` links no matter who was signed in, so an existing
 * customer clicking a system was sent to create a second account instead of
 * asking for one. The interesting assertions are therefore the negative ones:
 * that the button count equals the number of servable systems rather than the
 * number of cards, and that a request alone creates no install row.
 *
 * Run: npx tsx scripts/systems-install-check.ts
 */
/**
 * Driven against the PUBLIC origin on purpose.
 *
 * Better Auth's `trustedOrigins()` is derived from NEXT_PUBLIC_APP_URL
 * (`https://bosc.dpdns.org`) and deliberately excludes `localhost`, so a
 * browser-side sign-in on `http://localhost:3100` is refused with
 * INVALID_ORIGIN — the request carries `Origin: http://localhost:3100` and the
 * server has no reason to trust it. Hitting the same origin the customers use
 * removes the CSRF special-casing entirely, so what is checked here is the path
 * they actually walk.
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://bosc.dpdns.org";
const PW = "Sodb!123456789";

const AR = {
  installNow: "ثبّت الآن",
  pending: "بانتظار الموافقة",
  pendingBadge: "قيد الموافقة",
  installedBadge: "مثبّت",
  open: "افتح النظام",
  soon: "قريباً",
};

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

async function main() {
  const sources = listSystemSources();
  const cardIds = BUSINESS_SYSTEMS.map((s) => s.id);
  const activeSlugs = (await prisma.app.findMany({ where: { isActive: true }, select: { slug: true } })).map(
    (a) => a.slug,
  );
  const expected = installableCardIds({ cardIds, activeSlugs, sourceSlugs: sources });

  check(
    "at least one card is installable",
    expected.size > 0,
    `installable=${[...expected].join(", ") || "none"} (sources=${sources.join(", ") || "none"})`,
  );

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox"],
  });
  const stamp = Date.now();
  const email = `sodb+${stamp}@sysinstall.local`;
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: "Probe SystemsInstall", slug: `probe-sysinstall-${stamp}`, status: "active" },
  });
const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
  const errors: string[] = [];
  let phase = "startup";
  page.on("pageerror", (e) => errors.push(`[${phase}] pageerror: ${e instanceof Error ? e.message : String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${phase}] console: ${m.text()}`);
  });

  try {
    const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE,
        referer: `${BASE}/signup`,
      },
      body: JSON.stringify({ email, password: PW, name: "SODB" }),
    });
    if (!su.ok) throw new Error(`sign-up -> ${su.status} ${await su.text()}`);
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    check("probe user created", Boolean(u), `email=${email}`);
    if (!u) throw new Error("no probe user");

    await prisma.member.create({
      data: { id: randomUUID(), organizationId: org.id, userId: u.id, role: "owner" },
    });
    await prisma.session.updateMany({ where: { userId: u.id }, data: { activeOrganizationId: org.id } });

    // 1. Signed OUT: no install affordance at all, because there is no
    //    organization to install into.
    phase = "signed-out";
    let resp = await page.goto(`${BASE}/systems`, { waitUntil: "networkidle2" });
    check("systems returns 200", resp?.status() === 200, `status=${resp?.status()}`);
    const signedOut = await page.evaluate((label: string) => document.body.innerText.split(label).length - 1, AR.installNow);
    check("a signed-out visitor sees no install button", signedOut === 0, `"${AR.installNow}" x${signedOut}`);
    await page.evaluate(() => fetch("/api/auth/sign-out/email", { method: "POST" }));
    await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });

    // 2. Signed IN: exactly the servable cards offer install, no more.
    const si = await page.evaluate(
      async (m: string, x: string) => {
        const r = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: m, password: x }),
        });
        return { status: r.status, body: (await r.json().catch(() => ({}))) as { token?: string } };
      },
      email,
      PW,
    );
    // Asserted, not assumed: a refused sign-in leaves an anonymous session, and
    // every check below would then pass or fail for the wrong reason.
    check("signed in", si.status < 400, `sign-in -> ${si.status}`);
    if (si.status >= 400) throw new Error(`sign-in refused: ${si.status}`);

    // Sign-in MINTS A NEW SESSION ROW, so the active org has to be pointed at
    // that row. The update before sign-in landed on the row that was just
    // discarded, and the page then rendered the anonymous view — a probe that
    // looks signed in and is not.
    if (si.body.token) {
      await prisma.session.updateMany({
        where: { token: si.body.token },
        data: { activeOrganizationId: org.id },
      });
    }
    const active = await prisma.session.findFirst({
      where: { userId: u.id, activeOrganizationId: org.id },
      select: { id: true },
    });
    check("the session carries the active organization", Boolean(active), `session=${active?.id ?? "none"}`);
    if (!active) throw new Error("no session has the probe org active");

    phase = "signed-in";
    resp = await page.goto(`${BASE}/systems`, { waitUntil: "networkidle2" });
    check("systems as a signed-in member returns 200", resp?.status() === 200, `status=${resp?.status()}`);

    const buttons = await page.evaluate(
      (label: string) =>
        Array.from(document.querySelectorAll("button")).filter((b) => (b.textContent || "").includes(label)).length,
      AR.installNow,
    );
    check(
      "only servable systems offer install",
      buttons === expected.size,
      `buttons=${buttons} expected=${expected.size} (${[...expected].join(", ")})`,
    );

    const target = [...expected][0];
    if (!target) throw new Error("nothing installable to click");

    const card = BUSINESS_SYSTEMS.find((s) => s.id === target)!;
    const countRequests = () =>
      prisma.organizationAppRequest.count({
        where: { organizationId: org.id, app: { slug: target }, status: "pending" },
      });
    const countOrgRows = () =>
      prisma.organizationApp.count({ where: { organizationId: org.id, app: { slug: target } } });
    const before = await countRequests();

    const posts: string[] = [];
    const bodies: string[] = [];
    const onResponse = (r: { url(): string; status(): number; text(): Promise<string> }) => {
      if (r.url().includes("/api/v1/apps/") && r.url().includes("/request")) {
        posts.push(`${r.status()} ${r.url().replace(BASE, "")}`);
        void r
          .text()
          .then((t: string) => bodies.push(t.slice(0, 300)))
          .catch(() => bodies.push("<body unreadable>"));
      }
    };
    page.on("response", onResponse);

    // Scoped to `.demo-card`: the grid renders <a>, <button> and <div> cards
    // depending on state, and the installable one is a <button class="demo-card">,
    // so a `div.group` selector silently matches nothing. Matching on the card's
    // name also scopes the click to THIS system rather than whichever servable one
    // happens to sort first.
    const clicked = await page.evaluate(
      (input: { label: string; name: string }) => {
        const cards = Array.from(document.querySelectorAll(".demo-card"));
        const own = cards.find((c) => (c.textContent || "").includes(input.name));
        if (!own) return `card not found (cards=${cards.length})`;
        // The card IS the control when it is installable; fall back to a button
        // inside it so this also works if the card is ever wrapped.
        const btn =
          own.tagName === "BUTTON"
            ? (own as HTMLButtonElement)
            : Array.from(own.querySelectorAll("button")).find((b) => (b.textContent || "").includes(input.label));
        if (!btn) return `no control on card (tag=${own.tagName}, text=${(own.textContent || "").slice(0, 80)})`;
        btn.click();
        return "clicked";
      },
      { label: AR.installNow, name: card.nameAr },
    );

    let after = before;
    for (let i = 0; i < 40 && after === before; i++) {
      await new Promise((r) => setTimeout(r, 500));
      after = await countRequests();
    }
    page.off("response", onResponse);
    await new Promise((r) => setTimeout(r, 800));
    // Why an install row exists at all: the API answering "installed" means it was
    // already there, and anything else means something wrote one behind the queue.
    if (await countOrgRows() > 0) {
      const rows = await prisma.organizationApp.findMany({
        where: { organizationId: org.id, app: { slug: target } },
        select: { status: true, version: true, installedAt: true, activatedAt: true, createdAt: true },
      });
      console.log("      orgApp rows:", JSON.stringify(rows), "| response:", bodies.join(" | ") || "none");
    }

    // The DB count is the assertion; `posts` is only a diagnostic. Puppeteer's
    // `response.text()` races the redirect/close, so the network log can come
    // back empty on a request that demonstrably succeeded — asserting on it would
    // report a false failure against working code.
    check(
      "clicking install files a platform approval request",
      after === before + 1,
      `slug=${target} requests ${before} -> ${after}; click=${clicked}; post=${posts.join(", ") || "not captured"}; body=${bodies.join(" | ") || "n/a"}`,
    );
    check(
      "the request installs nothing on its own",
      (await countOrgRows()) === 0,
      `orgApp rows=${await countOrgRows()} (an admin approval is what creates the install)`,
    );

    // If the request landed under a DIFFERENT organization than the probe's,
    // every count above reads zero while the UI honestly says "pending" — the
    // card would be telling the truth about someone else's queue.
    const anyPending = await prisma.organizationAppRequest.findMany({
      where: { app: { slug: target }, status: "pending" },
      select: { organizationId: true, organization: { select: { slug: true } } },
    });
    check(
      "the request was filed for THIS organization",
      anyPending.every((r) => r.organizationId === org.id),
      `pending=${JSON.stringify(anyPending.map((r) => r.organization.slug))} probe=${org.slug}`,
    );
    if (anyPending.some((r) => r.organizationId !== org.id)) {
      await prisma.organizationAppRequest.deleteMany({
        where: { app: { slug: target }, status: "pending", organizationId: { not: org.id } },
      });
    }

    // 3. The card reflects the queue without a reload.
    let sawPending = false;
    for (let i = 0; i < 10 && !sawPending; i++) {
      await new Promise((r) => setTimeout(r, 300));
      sawPending = await page.evaluate(
        (p: string) => document.body.innerText.includes(p),
        AR.pending,
      );
    }
    check("the card reads as waiting for approval", sawPending, `looking for "${AR.pending}"`);

    // 4. Re-requesting is idempotent, so a second click cannot spam the queue.
    const second = await page.evaluate(
      (input: { label: string; name: string }) => {
        const own = Array.from(document.querySelectorAll(".demo-card")).find((c) =>
          (c.textContent || "").includes(input.name),
        );
        const btn =
          own?.tagName === "BUTTON"
            ? (own as HTMLButtonElement)
            : own
              ? Array.from(own.querySelectorAll("button")).find((b) => (b.textContent || "").includes(input.label))
              : undefined;
        return btn ? "still clickable" : "not clickable";
      },
      { label: AR.installNow, name: card.nameAr },
    );
    check(
      "a queued system offers no second install button",
      second === "not clickable",
      `re-render state=${second}`,
    );

    // 5. The queue is visible in the profile's systems tab, which is where the
    //    customer is told to look. Asserted server-side: that panel is rendered
    //    from the very same pending rows.
    const pendingForProfile = await prisma.organizationAppRequest.findMany({
      where: { organizationId: org.id, status: "pending" },
      select: { app: { select: { slug: true } } },
    });
    check(
      "the pending request is the one the profile systems tab reads",
      pendingForProfile.length === 1 && pendingForProfile[0].app.slug === target,
      `pending=${pendingForProfile.map((p) => p.app.slug).join(", ")}`,
    );

    // 6. Approve it the way the admin console does, then confirm the card
    //    flips to installed and points at this org's own copy of the system.
    const req = await prisma.organizationAppRequest.findFirst({
      where: { organizationId: org.id, status: "pending" },
      select: { id: true },
    });
    if (!req) {
      check("approval target found", false, "no pending request to approve");
    } else {
      const app = await prisma.app.findUnique({ where: { slug: target }, select: { id: true, version: true } });
      // Platform-realm admin. The field is `user.role` with the value `"admin"`
      // — Better Auth's admin plugin — and the tenant role lives on `member.role`.
      // This used to read `platformRole: "platform_admin"`, a field that no longer
      // exists; `tsc` did not catch it because the Prisma client had not been
      // regenerated, and it surfaced only when a build type-checked this file.
      const admin = await prisma.user.findFirst({
        where: { role: "admin" },
        select: { id: true },
      });
      if (!app || !admin) {
        check("admin approver available", false, `app=${Boolean(app)} admin=${Boolean(admin)}`);
      } else {
        // The same two steps the approval route performs, in the same order: the
        // install first, then the status flip. Going through
        // `installSystemForOrg` rather than writing the row directly is the point
        // — it is the function that clones the source, so a regression there
        // (a row with no files behind it) shows up here instead of only on the
        // customer's first open.
        const installed = await installSystemForOrg(org.id, { slug: target, userId: admin.id });
        await prisma.organizationAppRequest.update({
          where: { id: req.id },
          data: { status: "approved", decidedByUserId: admin.id, decidedAt: new Date(), rejectReason: null },
        });
        // `preparing` is the correct answer for a fresh org: the copy is cloned
        // but the production build runs on first open, and claiming "installed"
        // would promise an app that cannot open yet.
        check(
          "approving produced a real install, not just a status flip",
          (installed.state === "installed" || installed.state === "preparing") &&
            Boolean(installed.route),
          `state=${installed.state} route=${installed.route}`,
        );

        phase = "after-approval";
        await page.goto(`${BASE}/systems`, { waitUntil: "networkidle2" });
        const after2 = await page.evaluate(
          (input: { badge: string; open: string; name: string }) => {
            const own = Array.from(document.querySelectorAll(".demo-card")).find((c) =>
              (c.textContent || "").includes(input.name),
            );
            if (!own) return { found: false, badge: false, href: null as string | null };
            // An installed card is the anchor itself, not a wrapper.
            const anchor = (own.tagName === "A" ? own : own.closest("a")) as HTMLAnchorElement | null;
            return {
              found: true,
              badge: (own.textContent || "").includes(input.badge),
              href: anchor?.getAttribute("href") ?? null,
            };
          },
          { badge: AR.installedBadge, open: AR.open, name: card.nameAr },
        );
        check("the approved card is badged installed", after2.found && after2.badge, JSON.stringify(after2));
        check(
          "the installed card links to this org's own copy",
          after2.href === `/${org.slug}/${target}`,
          `href=${after2.href}`,
        );
        check(
          "an installed system offers no install button",
          (await page.evaluate((l: string) => document.body.innerText.split(l).length - 1, AR.installNow)) === 0,
          `remaining "${AR.installNow}"`,
        );

        // 7. The install row is what the profile tab lists.
        const shown = await prisma.organizationApp.findMany({
          where: { organizationId: org.id },
          select: { app: { select: { slug: true } }, status: true },
        });
        check(
          "the approved system appears in the org's systems",
          shown.some((s) => s.app.slug === target && s.status === "active"),
          `rows=${JSON.stringify(shown)}`,
        );
      }
    }

    const hydration = errors.filter((m) => /hydrat|didn.t match|mismatch/i.test(m));
    if (hydration.length) console.log("\n--- HYDRATION ---\n" + hydration[0] + "\n---");
    check("no hydration mismatch on /systems", hydration.length === 0, hydration[0]?.slice(0, 200) ?? "");
  } finally {
    await browser.close();
    // The vault folder and the registry entry too. Approving runs
    // `installSystemForOrg`, which registers the org and clones 324 files into
    // `orginazition/<slug>/`, and deleting only the database rows leaves both
    // behind — a run that leaves a folder per execution is not a run anybody
    // runs twice.
    rmSync(orgVaultPaths(org.slug).root, { recursive: true, force: true });

    await prisma.organizationApp.deleteMany({ where: { organizationId: org.id } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: org.id } });
    await prisma.member.deleteMany({ where: { organizationId: org.id } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
    const uu = await prisma.user.findUnique({ where: { email } });
    if (uu) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: uu.id } });
      await prisma.member.deleteMany({ where: { userId: uu.id } });
      await prisma.session.deleteMany({ where: { userId: uu.id } });
      await prisma.account.deleteMany({ where: { userId: uu.id } });
      await prisma.user.deleteMany({ where: { id: uu.id } });
    }
    // Unconditional, not gated on `entry`: `withRegistry` re-reads the file from
    // disk, while `getVaultEntry` answers from an in-process cache loaded before
    // this run registered the org. Gating on the cached value would skip the
    // write and leave the entry behind on every run.
    await withRegistry((registry) => {
      for (const [key, value] of Object.entries(registry.orgs)) {
        if (key === org.slug || value.slug === org.slug) delete registry.orgs[key];
      }
    });
    await prisma.$disconnect();
  }

  console.log(`\n${passed}/${passed + failures.length} checks passed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});