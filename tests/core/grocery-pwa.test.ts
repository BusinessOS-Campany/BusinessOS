import { describe, expect, it } from "vitest";
import { buildPwaManifest, manifestScope } from "../../system/grocery/src/lib/pwa";

/**
 * The manifest is what makes the tenant app installable, and it is served from
 * inside the org's mount point. Next rewrites the `<link rel="manifest">` href
 * but NOT the body of `app/manifest.ts`, so every path in here is the app's
 * own responsibility.
 *
 * Left root-absolute, `start_url` opened the platform home page and `scope`
 * claimed the entire origin — so the installed app launched somewhere the user
 * did not ask for, and five tenant apps on one origin all claimed the same
 * scope. These are the assertions that keep that from coming back.
 */

const LABELS = { storeName: "بقالة", appName: "نظام إدارة البقالة" };

describe("manifestScope", () => {
  it("is the org mount point, not the origin root", () => {
    expect(manifestScope("/p967770416171/grocery")).toBe("/p967770416171/grocery");
    expect(manifestScope("/gm/grocery")).toBe("/gm/grocery");
  });

  it("falls back to the standalone mount point and normalises slashes", () => {
    expect(manifestScope(undefined)).toBe("/grocery");
    expect(manifestScope("/gm/grocery/")).toBe("/gm/grocery");
  });
});

describe("buildPwaManifest", () => {
  const org = "/p967770416171/grocery";

  it("scopes id, start_url and scope to the mount point", () => {
    const m = buildPwaManifest(org, LABELS);
    expect(m.id).toBe(org);
    expect(m.scope).toBe(org);
    expect(m.start_url).toBe(`${org}/dashboard`);
    // The bug: any of these three being "/" breaks or hijacks the install.
    expect(m.start_url).not.toBe("/");
    expect(m.scope).not.toBe("/");
  });

  it("sends the standalone app to the dashboard, which is where users expect it", () => {
    expect(buildPwaManifest("/gm/grocery", LABELS).start_url).toBe("/gm/grocery/dashboard");
  });

  it("keeps every icon inside the mount point", () => {
    const icons = buildPwaManifest(org, LABELS).icons ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of icons) {
      expect(icon.src.startsWith(`${org}/`)).toBe(true);
    }
  });

  it("declares a maskable icon, or Android installs it with a cropped badge", () => {
    const icons = buildPwaManifest(org, LABELS).icons ?? [];
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("is installable standalone in RTL", () => {
    const m = buildPwaManifest(org, LABELS);
    expect(m.display).toBe("standalone");
    expect(m.dir).toBe("rtl");
    expect(m.name).toContain(LABELS.storeName);
    expect(m.short_name).toBe(LABELS.appName);
  });

  it("works for the standalone build too, with no org segment", () => {
    const m = buildPwaManifest(undefined, LABELS);
    const icons = m.icons ?? [];
    expect(m.id).toBe("/grocery");
    expect(m.start_url).toBe("/grocery/dashboard");
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((i) => i.src.startsWith("/grocery/icons/"))).toBe(true);
  });
});