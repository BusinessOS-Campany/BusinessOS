/**
 * Visual + round-trip check for the deployment history / rollback dialog on the
 * platform-admin systems console.
 *
 * Seeds a throwaway imported system with one finished (failed) deployment and
 * one live (active) deployment, signs in as a throwaway platform admin, then
 * drives Edge headless: the History button must open the dialog, list both
 * commits, and offer "Roll back to this" for the finished one only — the live
 * commit is what you roll back *from*, so offering to roll back to it would be a
 * no-op button. Clicking it must queue a real rollback deployment through the
 * API (verified in the database, not just in the DOM).
 *
 * Everything it seeds is removed in `finally`, including the rollback row the
 * click queues (via the source's cascade delete).
 *
 * Usage: npx tsx scripts/rollback-dialog-check.ts [baseUrl]
 *        (baseUrl defaults to the local sandbox the caller started, e.g. :3110)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = (process.argv[2] ?? "http://localhost:3110").replace(/\/+$/, "");
const EDGE = process.env.PROBE_BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

for (const file of [".env.local", ".env"]) {
  try {
    for (const raw of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim();
    }
  } catch {
    /* optional */
  }
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { prisma } = await import("../src/core/db/client");
  const { auth } = await import("../src/core/auth/server");

  const installationId = Math.floor(Date.now() / 1000);
  const slug = `gh-rollback-probe-${Date.now().toString(36)}`;
  const pastSha = "a".repeat(40);
  const liveSha = "b".repeat(40);
  const probeEmail = `probe-rollback-${Date.now().toString(36)}@bos.local`;
  const probePassword = "RollbackProbe12345!";
  let userId: string | null = null;
  let browser: import("puppeteer-core").Browser | null = null;

  await prisma.githubInstallation.upsert({
    where: { id: installationId },
    create: {
      id: installationId,
      accountLogin: "BusinessOS-Campany",
      accountType: "Organization",
      repositorySelection: "all",
      suspended: false,
    },
    update: {},
  });
  await prisma.systemSource.create({
    data: {
      slug,
      repoFullName: "BusinessOS-Campany/rollback-probe",
      installationId,
      branch: "main",
      archived: false,
    },
  });
  // The commit an admin rolls back TO: finished long ago.
  await prisma.systemDeployment.create({
    data: { slug, commitSha: pastSha, ref: "main", trigger: "webhook", status: "failed", finishedAt: new Date(Date.now() - 60_000) },
  });
  // The commit currently live: rolling back to it is a no-op, so no button.
  await prisma.systemDeployment.create({
    data: { slug, commitSha: liveSha, ref: "main", trigger: "webhook", status: "active", isActive: true },
  });

  try {
    const created = await auth.api.signUpEmail({
      body: { email: probeEmail, password: probePassword, name: "Rollback Probe" },
    });
    userId = created.user.id;
    await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });

    const res = await auth.api.signInEmail({
      body: { email: probeEmail, password: probePassword },
      asResponse: true,
    });
    if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
    const setCookies = res.headers.getSetCookie();
    const cookieHeader = setCookies.find((c) => /session/i.test(c.split("=")[0] ?? ""));
    if (!cookieHeader) throw new Error("no session cookie");
    // A session token can contain "=", so only the first "=" separates name from value.
    const pair = cookieHeader.split(";")[0];
    const eqIdx = pair.indexOf("=");
    const cookieName = pair.slice(0, eqIdx).trim();
    const cookieValue = pair.slice(eqIdx + 1).trim();
    if (!cookieName || !cookieValue) throw new Error(`unparseable session cookie: ${cookieHeader.slice(0, 80)}`);

    const consoleErrors: string[] = [];
    browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(60_000);
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
    page.on("dialog", (d) => void d.accept());
    // Always Secure: the session cookie is named `__Secure-…`, and Chrome
    // rejects that prefix without the attribute — localhost counts as a
    // trustworthy origin, so this holds on the http sandbox too.
    await page.setCookie({
      name: cookieName,
      value: cookieValue,
      url: base,
      httpOnly: true,
      secure: true,
    });

    const resp = await page.goto(`${base}/platform-admin/systems`, { waitUntil: "networkidle2" });
    check("systems page loads for a platform admin", resp?.status() === 200 && !page.url().endsWith("/signin"), `status ${resp?.status()} url ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body.innerText);
    check("imported system row renders", bodyText.includes("BusinessOS-Campany/rollback-probe"));
    check("system slug renders", bodyText.includes(slug));

    const historyBtn = await page.$(`button[title="Deployments"], button[title="سجل النشر"]`);
    check("history button present on the system row", !!historyBtn);
    if (!historyBtn) throw new Error("no history button; cannot continue");

    await historyBtn.click();
    // Wait for the list itself, not just the title: the overlay can be mounted
    // a paint before its rows, and reading innerText in that window returns "".
    await page.waitForFunction(
      () => {
        const overlay = [...document.querySelectorAll(".fixed.inset-0")].find((el) =>
          /Deployment history|سجل عمليات النشر/.test(el.textContent ?? ""),
        );
        return Boolean(overlay && (overlay.textContent ?? "").includes("aaaaaaa"));
      },
      { timeout: 15_000 },
    );
    check("dialog opens with its title and lists rows", true);

    // The overlay is found via its own heading: other fixed layers share the
    // `fixed inset-0` classes, and the first one in the DOM is not this dialog.
    const dialogText = await page.evaluate(() => {
      const overlay = [...document.querySelectorAll(".fixed.inset-0")].find((el) =>
        /Deployment history|سجل عمليات النشر/.test(el.textContent ?? ""),
      ) as HTMLElement | undefined;
      return overlay?.innerText ?? "";
    });
    check("dialog lists the finished commit", dialogText.includes("aaaaaaa"));
    check("dialog lists the live commit", dialogText.includes("bbbbbbb"));
    check("trigger badge renders", /Webhook|دفع/i.test(dialogText));
    check("status badge renders", /Failed|فشل/i.test(dialogText));

    const rollbackButtons = await page.$$(`button[title="Roll back to this"], button[title="الرجوع إلى هذا الإصدار"], .fixed.inset-0 button`);
    const rollbackLabelled = await page.evaluateHandle(() =>
      [...document.querySelectorAll(".fixed.inset-0 button")].filter((b) =>
        (b.textContent ?? "").includes("Roll back to this") || (b.textContent ?? "").includes("الرجوع إلى هذا الإصدار"),
      ),
    );
    const rollbackCount = await page.evaluate((h) => (h as unknown as { length: number }).length, rollbackLabelled);
    check("exactly one rollback button (none for the live commit)", rollbackCount === 1, `found ${rollbackCount} (total dialog buttons ${rollbackButtons.length})`);
    check("empty-state text is absent", !dialogText.includes("No deployments yet") && !dialogText.includes("لا توجد عمليات نشر بعد"));

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".fixed.inset-0 button")].find(
        (b) => (b.textContent ?? "").includes("Roll back to this") || (b.textContent ?? "").includes("الرجوع إلى هذا الإصدار"),
      );
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForFunction(
      () => document.body.innerText.includes("Rollback queued.") || document.body.innerText.includes("تمت جدولة عملية النشر."),
      { timeout: 15_000 },
    );
    check("toast confirms the rollback was queued", true);

    const queued = await prisma.systemDeployment.findFirst({
      where: { slug, commitSha: pastSha, trigger: "rollback" },
      orderBy: { queuedAt: "desc" },
    });
    check("a rollback deployment exists in the database", !!queued, queued ? `status ${queued.status}` : "not found");

    check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  } finally {
    await browser?.close().catch(() => undefined);
    // Deleting the source cascades to every deployment it owns, including the
    // rollback the click queued.
    await prisma.systemSource.delete({ where: { slug } }).catch(() => undefined);
    await prisma.githubInstallation.delete({ where: { id: installationId } }).catch(() => undefined);
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
