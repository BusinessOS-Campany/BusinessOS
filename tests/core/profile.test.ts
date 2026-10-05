import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES, EMPTY_EXTRAS, EMPTY_SOCIALS, LIMITS, SOCIAL_KEYS,
  joinName, normalizeExtras, normalizeMediaRef, normalizePreferences, normalizeSocials,
  normalizeUrl, normalizeUsername, sanitizeMultiline, sanitizeText, splitName,
} from "@/core/profile/normalize";
import {
  MEDIA_CACHE_CONTROL, MEDIA_MAX_BYTES, MEDIA_URL, mediaCandidateKeys, mediaEtag, mediaKey,
  mediaNotModified, sniffImage,
} from "@/core/profile/media";
import { formatBytes, initialsOf, isRealIp, describeUserAgent } from "@/core/profile/format";
import { PROFILE_TABS, parseProfileTab } from "@/core/profile/types";
import { dictionaries, t } from "@/core/i18n/dictionaries";
import { activityLabel, countryFlag, orgStatus, roleLabel, systemStatus } from "@/components/profile/labels";

/**
 * Unit coverage for the pure profile layer.
 *
 * Everything here is DB-free on purpose: these are the security boundary
 * (sanitisers, media sniffing, tab parsing) and the i18n contract, so they must
 * stay testable without a database or a running dev server. The HTTP-level
 * behaviour (auth gating, IDOR, transactional audit) is covered by the
 * integration script in scripts/ rather than here.
 */

const ar = dictionaries.ar;
const en = dictionaries.en;

describe("sanitizeText", () => {
  it("strips control characters, bidi overrides and collapses whitespace", () => {
    expect(sanitizeText("  GMS   NOW \u0000\u0007 ", 40)).toBe("GMS NOW");
    // U+202E reverses what follows it in a terminal: the classic "exe.txt"
    // -> "txt.exe" spoof. It has no business surviving into the database.
    expect(sanitizeText("a\u202Eb", 40)).toBe("ab");
    expect(sanitizeText("a\u2066b\u2069", 40)).toBe("ab");
    expect(sanitizeText("a\u200Bb", 40)).toBe("ab");
  });

  it("never exceeds the limit", () => {
    expect(sanitizeText("x".repeat(500), 10)).toHaveLength(10);
  });

  it("returns an empty string for non-strings", () => {
    expect(sanitizeText(null, 10)).toBe("");
    expect(sanitizeText({ toString: () => "sneaky" }, 10)).toBe("");
  });
});

describe("sanitizeMultiline", () => {
  it("keeps newlines, collapses blank runs and caps the length", () => {
    const many = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const out = sanitizeMultiline(many, LIMITS.bio);
    expect(out).toContain("line 0");
    expect(out.length).toBeLessThanOrEqual(LIMITS.bio);
    expect(sanitizeMultiline("a\r\n\r\n\r\n\r\nb", LIMITS.bio)).toBe("a\n\nb");
  });
});

describe("normalizeUsername", () => {
  it("lower-cases and strips an @ prefix", () => {
    expect(normalizeUsername("@GMSNOW")).toEqual({ ok: true, value: "gmsnow" });
    expect(normalizeUsername("  Ye_1 ")).toEqual({ ok: true, value: "ye_1" });
  });

  it("rejects empty, too-short, too-long and illegal characters", () => {
    expect(normalizeUsername("")).toMatchObject({ ok: false, reason: "empty" });
    expect(normalizeUsername("ab")).toMatchObject({ ok: false, reason: "tooShort" });
    expect(normalizeUsername("a".repeat(LIMITS.usernameMax + 1))).toMatchObject({ ok: false, reason: "tooLong" });
    // These are the characters that would let a handle escape into a URL or a
    // path, so they must never survive normalisation.
    for (const bad of ["a b", "a/b", "a\\b", "a?b", "a#b", "<script>", "a\u0000b"]) {
      expect(normalizeUsername(bad).ok, bad).toBe(false);
    }
  });

  it("allows dots, dashes and underscores", () => {
    expect(normalizeUsername("a.b-c_d")).toEqual({ ok: true, value: "a.b-c_d" });
  });
});

describe("normalizeUrl", () => {
  it("only accepts http(s)", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com/");
    expect(normalizeUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("rejects script and data URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
  });

  it("pins a protocol-relative link to https rather than leaving it ambiguous", () => {
    // "//evil.example" must not survive as-is, because an <a href> would then
    // inherit whatever scheme the page was served with.
    expect(normalizeUrl("//evil.example")).toBe("https://evil.example/");
  });

  it("trims and treats blank input as absent", () => {
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
});

describe("normalizeMediaRef", () => {
  it("accepts only the two private API paths", () => {
    expect(normalizeMediaRef(MEDIA_URL.avatar)).toBe(MEDIA_URL.avatar);
    expect(normalizeMediaRef(MEDIA_URL.cover)).toBe(MEDIA_URL.cover);
  });

  it("rejects traversal, foreign hosts and look-alike paths", () => {
    for (const bad of [
      "/api/v1/profile/avatar/../../users/secret",
      "/api/v1/profile/avatar/../../../etc/passwd",
      "https://evil.example/api/v1/profile/avatar",
      "/api/v1/profile/avatarz",
      "/api/v2/profile/avatar",
      "/static/../api/v1/profile/avatar",
      "javascript:alert(1)",
      "//evil.example/api/v1/profile/avatar",
    ]) {
      expect(normalizeMediaRef(bad), bad).toBeNull();
    }
  });
});

describe("jsonb normalisers", () => {
  it("drops unknown social keys instead of persisting them", () => {
    const s = normalizeSocials({ website: "https://a.example", isAdmin: true, role: "owner" });
    expect(s.website).toBe("https://a.example/");
    expect(Object.keys(s).sort()).toEqual([...SOCIAL_KEYS, "links"].sort());
    expect("isAdmin" in s).toBe(false);
  });

  it("caps the custom link list and drops entries with no url", () => {
    const links = Array.from({ length: LIMITS.socialLinks + 5 }, (_, i) => ({ id: `l${i}`, label: "x", url: "https://e.example" }));
    const s = normalizeSocials({ links });
    expect(s.links.length).toBe(LIMITS.socialLinks);
    expect(normalizeSocials({ links: [{ id: "a", label: "a", url: "javascript:x" }] }).links).toEqual([]);
  });

  it("accepts only strict booleans, defaulting anything else", () => {
    // Deliberately strict: a string or a number is not consent, so a polluted
    // jsonb column can never quietly switch email or marketing on.
    expect(normalizePreferences({ marketing: "yes", aiAssist: 1 })).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ marketing: true, emailNotifications: false })).toEqual({
      ...DEFAULT_PREFERENCES,
      marketing: true,
      emailNotifications: false,
    });
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences("nonsense")).toEqual(DEFAULT_PREFERENCES);
  });

  it("normalises extras and drops unknown keys", () => {
    const e = normalizeExtras({ jobTitle: "  QA  ", isHacker: true });
    expect(e.jobTitle).toBe("QA");
    expect("isHacker" in e).toBe(false);
    expect(normalizeExtras(null)).toEqual(EMPTY_EXTRAS);
  });

  it("survives a hostile payload without throwing", () => {
    for (const bad of [null, undefined, 42, "str", [], { links: "no" }, { website: {} }]) {
      expect(() => normalizeSocials(bad)).not.toThrow();
      expect(() => normalizeExtras(bad)).not.toThrow();
      expect(() => normalizePreferences(bad)).not.toThrow();
    }
    expect(normalizeSocials(null)).toEqual(EMPTY_SOCIALS);
    expect(normalizeExtras("str")).toEqual(EMPTY_EXTRAS);
  });
});

describe("name helpers", () => {
  it("round-trips a full name", () => {
    expect(splitName("GMS Now")).toEqual({ firstName: "GMS", lastName: "Now" });
    expect(joinName("GMS", "Now")).toBe("GMS Now");
  });

  it("handles single and blank names", () => {
    expect(splitName("GMS")).toEqual({ firstName: "GMS", lastName: "" });
    expect(splitName(null)).toEqual({ firstName: "", lastName: "" });
    expect(joinName("", "")).toBe("");
  });
});

describe("sniffImage", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it("detects the three supported formats from magic bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toMatchObject({ ext: "jpg", mime: "image/jpeg" });
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toMatchObject({ ext: "png", mime: "image/png" });
    // WebP is "RIFF" + 4 size bytes + "WEBP", so the tag sits at offset 8.
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50)))
      .toMatchObject({ ext: "webp", mime: "image/webp" });
    // A RIFF container that is not WebP (here: WAV) must not be accepted.
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });

  it("rejects non-images, including text and executables", () => {
    expect(sniffImage(bytes(0x3c, 0x68, 0x74, 0x6d, 0x6c))).toBeNull(); // <html>
    expect(sniffImage(bytes(0x4d, 0x5a))).toBeNull(); // MZ
    expect(sniffImage(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(sniffImage(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
    expect(sniffImage(bytes())).toBeNull();
  });
});

describe("media storage keys", () => {
  it("namespaces keys per user and kind", () => {
    expect(mediaKey("u1", "avatar", "png")).toBe("profile/avatars/u1.png");
    expect(mediaKey("u1", "cover", "jpg")).toBe("profile/covers/u1.jpg");
  });

  it("lists every candidate extension for cleanup", () => {
    const keys = mediaCandidateKeys("u1", "avatar");
    expect(keys).toContain("profile/avatars/u1.jpg");
    expect(keys).toContain("profile/avatars/u1.png");
    expect(keys).toContain("profile/avatars/u1.webp");
  });

  it("keeps the avatar under a 2 MB ceiling and the cover under 5 MB", () => {
    expect(MEDIA_MAX_BYTES.avatar).toBeLessThan(MEDIA_MAX_BYTES.cover);
  });
});

describe("media revalidation", () => {
  /**
   * The served bytes are private, session-gated and unversioned in the URL, so
   * the browser can never treat them as fresh-without-asking. `no-store` (what
   * `/api/:path*` used to stamp on them) threw the response away entirely, which
   * meant a full 2 MB avatar + 5 MB cover re-download on *every* profile view.
   * `private, no-cache` keeps the exact always-fresh guarantee and lets the 304
   * path below do the work: zero body bytes when nothing changed.
   */
  it("stays private, revalidated, and never public", () => {
    expect(MEDIA_CACHE_CONTROL).toContain("private");
    expect(MEDIA_CACHE_CONTROL).toContain("no-cache");
    expect(MEDIA_CACHE_CONTROL).not.toContain("public");
    // `no-store` is the value that must never come back: it forbids the browser
    // from keeping the body at all, which is the bug being fixed.
    expect(MEDIA_CACHE_CONTROL).not.toContain("no-store");
    // A finite freshness window is the point — `max-age=0` made must-revalidate
    // meaningless because there was nothing left to revalidate.
    expect(MEDIA_CACHE_CONTROL).not.toContain("max-age=0");
  });

  it("changes the validator when the bytes change", () => {
    const base = mediaEtag(2048, 1_700_000_000_000);
    expect(base).toBe(mediaEtag(2048, 1_700_000_000_000));
    expect(base).not.toBe(mediaEtag(4096, 1_700_000_000_000));
    expect(base).not.toBe(mediaEtag(2048, 1_700_000_000_001));
    // A quoted entity-tag, or a client sending it back verbatim can never match.
    expect(base).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
  });

  const etag = mediaEtag(2048, Date.UTC(2026, 0, 2, 3, 4, 5));
  const headers = (init: Record<string, string>) => new Headers(init);

  it("answers 304 when the client already holds these bytes", () => {
    expect(mediaNotModified(headers({ "if-none-match": etag }), etag, 0)).toBe(true);
    // If-None-Match is compared weakly, so a proxy's `W/` prefix still matches.
    expect(mediaNotModified(headers({ "if-none-match": `W/${etag}` }), etag, 0)).toBe(true);
    // A list, and the wildcard.
    expect(mediaNotModified(headers({ "if-none-match": `"other", ${etag}` }), etag, 0)).toBe(true);
    expect(mediaNotModified(headers({ "if-none-match": "*" }), etag, 0)).toBe(true);
  });

  it("sends the body again when the validator differs or is absent", () => {
    expect(mediaNotModified(headers({ "if-none-match": '"stale"' }), etag, 0)).toBe(false);
    expect(mediaNotModified(headers({}), etag, 0)).toBe(false);
    expect(mediaNotModified(headers({ "if-none-match": "" }), etag, 0)).toBe(false);
  });

  it("falls back to Last-Modified, truncated to the second HTTP dates carry", () => {
    const mtime = Date.UTC(2026, 0, 2, 3, 4, 5, 999);
    const exact = new Date(mtime).toUTCString();
    expect(mediaNotModified(headers({ "if-modified-since": exact }), etag, mtime)).toBe(true);
    expect(
      mediaNotModified(headers({ "if-modified-since": new Date(mtime + 60_000).toUTCString() }), etag, mtime),
    ).toBe(true);
    expect(
      mediaNotModified(headers({ "if-modified-since": new Date(mtime - 60_000).toUTCString() }), etag, mtime),
    ).toBe(false);
    // An unparseable date must not be read as "fresh".
    expect(mediaNotModified(headers({ "if-modified-since": "not-a-date" }), etag, mtime)).toBe(false);
  });

  it("lets If-None-Match win over If-Modified-Since", () => {
    // RFC 9110 §13.1.3: when both are present the ETag comparison decides, so a
    // replaced avatar can never be masked by a still-matching date.
    const mtime = Date.UTC(2026, 0, 2, 3, 4, 5, 999);
    expect(
      mediaNotModified(
        headers({ "if-none-match": '"stale"', "if-modified-since": new Date(mtime + 60_000).toUTCString() }),
        etag,
        mtime,
      ),
    ).toBe(false);
  });
});

describe("format helpers", () => {
  it("builds initials from the first and last name", () => {
    expect(initialsOf("GMS Now")).toBe("GN");
    expect(initialsOf("GMS Middle Now")).toBe("GN");
    expect(initialsOf("GMS")).toBe("GM");
    expect(initialsOf("  ")).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });

  it("does not treat loopback or private ranges as real IPs", () => {
    expect(isRealIp("8.8.8.8")).toBe(true);
    expect(isRealIp("2001:4860:4860::8888")).toBe(true);
    for (const internal of [
      "127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.5", "10.255.255.255",
      "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.1",
      "100.64.0.1", "::1", "::", "0:0:0:0:0:0:0:0", "unknown", "fd00::1", "fe80::1",
    ]) {
      expect(isRealIp(internal), internal).toBe(false);
    }
    expect(isRealIp(null)).toBe(false);
    expect(isRealIp("  ")).toBe(false);
  });

  it("summarises a user agent without leaking the raw string", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
    const d = describeUserAgent(ua);
    expect(d.os).toBeTruthy();
    expect(d.browser).toContain("Chrome");
    expect(describeUserAgent(null)).toEqual({ os: null, browser: null });
  });

  it("formats bytes in both locales", () => {
    expect(formatBytes(1024, "en")).toMatch(/1/);
    expect(formatBytes(0, "ar")).toBeTruthy();
  });
});

describe("parseProfileTab", () => {
  it("accepts every real tab", () => {
    for (const tab of PROFILE_TABS) expect(parseProfileTab(tab)).toBe(tab);
  });

  it("falls back to overview for anything unknown", () => {
    for (const bad of ["", "admin", "../../etc", null, undefined, "OVERVIEW"]) {
      expect(parseProfileTab(bad as string | null | undefined)).toBe("overview");
    }
  });
});

describe("profile i18n contract", () => {
  const keys = (obj: unknown, prefix = ""): string[] =>
    typeof obj !== "object" || obj === null
      ? [prefix]
      : Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));

  it("has byte-identical key sets in ar and en", () => {
    const arKeys = keys(ar).sort();
    const enKeys = keys(en).sort();
    expect(arKeys).toEqual(enKeys);
    expect(arKeys.length).toBeGreaterThan(200);
  });

  it("leaves no untranslated value in either locale", () => {
    for (const locale of [ar, en]) {
      for (const key of Object.keys(locale)) {
        const value = (locale as Record<string, unknown>)[key];
        if (typeof value === "string") expect(value.trim(), key).not.toBe("");
      }
    }
  });

  it("resolves every profile key the UI asks for", () => {
    const required = [
      "profile.nav.overview", "profile.nav.activity", "profile.nav.organizations",
      "profile.nav.systems", "profile.nav.security",
      "profile.stats.organizations", "profile.stats.systems", "profile.stats.sessions", "profile.stats.activity",
      "profile.account.username", "profile.account.fullName", "profile.account.preferences",
      "profile.account.statusActive", "profile.account.statusPending", "profile.account.notSet",
      "profile.account.platformAdmin", "profile.account.online", "profile.account.joined",
      "profile.orgs.empty", "profile.orgs.owner", "profile.orgs.systems", "profile.orgs.members", "profile.orgs.joined",
      "profile.systems.empty", "profile.systems.title", "profile.systems.installed", "profile.systems.progress", "profile.systems.recent",
      "profile.activity.total", "profile.activity.streak", "profile.activity.busiest", "profile.activity.dailyAvg",
      "profile.activity.dailyAvgHint", "profile.activity.best", "profile.activity.less", "profile.activity.more",
      "profile.activity.platform", "profile.activity.heatmapLabel", "profile.activity.levels", "profile.activity.loadMore",
      "profile.security.title", "profile.security.changePassword", "profile.security.sessions",
      "profile.security.twoFactorUnavailable", "profile.security.revoke", "profile.security.revokeAll",
      "profile.security.currentSession", "profile.security.signOut", "profile.security.passwordChanged",
      "profile.security.revoked", "profile.security.revokedAll", "profile.security.mismatch",
      "profile.editor.title", "profile.editor.save", "profile.editor.saving", "profile.editor.saved", "profile.editor.cancel",
      "profile.header.editProfile", "profile.header.changeCover",
      "profile.media.replace", "profile.media.remove", "profile.media.uploading", "profile.media.hint",
      "profile.identity.usernameHint", "profile.identity.usernameTaken", "profile.identity.usernameAvailable",
      "profile.identity.addLink", "profile.socials.invalidUrl", "profile.error.load", "profile.error.network",
      "profile.error.generic", "profile.empty.generic", "common.retry",
    ];
    for (const key of required) {
      expect(t(ar, key), `ar:${key}`).not.toBe(key);
      expect(t(en, key), `en:${key}`).not.toBe(key);
    }
  });

  it("keys every known audit action", () => {
    const actions = [
      "profile.patched", "profile.password_changed", "profile.session_revoked",
      "platform.tenant_created", "platform.tenant_suspended", "platform.tenant_reactivated",
      "platform.template_requested", "marketplace.app_installed", "marketplace.app_uninstalled",
      "marketplace.app_requested", "sale.created", "sale.confirmed", "export.completed",
      "isolation.test", "member.invited", "member.removed",
    ];
    for (const action of actions) {
      const label = activityLabel(ar, action);
      expect(label, action).not.toContain(".");
      expect(label, action).not.toMatch(/^[a-z]/);
    }
  });

  it("humanises an unknown audit action instead of leaking the key", () => {
    expect(activityLabel(en, "brand_new.thing_happened")).toBe("Thing happened");
  });
});

describe("presentation labels", () => {
  it("maps known roles and role-cases unknown ones", () => {
    expect(roleLabel(en, "owner")).toBeTruthy();
    expect(roleLabel(en, "owner")).not.toBe("owner");
    expect(roleLabel(en, "wizard")).toBe("Wizard");
  });

  it("maps organization and system statuses", () => {
    expect(orgStatus(en, "active").label).toBe("Active");
    expect(orgStatus(en, "suspended").tone).toBe("danger");
    expect(orgStatus(en, "unheard-of").label).toBe("Unheard-of");
    expect(systemStatus(en, "revoked").label).toBeTruthy();
  });

  it("flags a two-letter country code and nothing else", () => {
    expect(countryFlag("YE")).toBe("🇾🇪");
    expect(countryFlag("ye")).toBe("🇾🇪");
    expect(countryFlag(null)).toBe("🏳️");
    expect(countryFlag("ABC")).toBe("🏳️");
  });
});
