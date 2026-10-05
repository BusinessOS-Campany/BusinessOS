import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import { isValidOrgSlug } from "@/core/tenancy/org-route";
import { capSlug, ensureUniqueOrgSlug, slugifyOrgName } from "@/core/tenancy/org-slug";

/**
 * Unit coverage for org-slug generation.
 *
 * This exists because of a bug that only shows up with real Google accounts:
 * sign-up provisions an org from the provider display name, and the slugifier in
 * use preserved Arabic characters. `isValidOrgSlug` rejects those, so the
 * `/{org}` route never matched and the org the user had just created 404'd at
 * its own URL. Nothing else in the codebase was broken, which is exactly why it
 * needed a test rather than a code review.
 *
 * DB-free on purpose: the only I/O is injected as a lookup function, so the
 * collision loop is testable without a database.
 */
describe("slugifyOrgName", () => {
  it("turns a Latin name into a readable URL segment", () => {
    expect(slugifyOrgName("Ahmed Al-Said")).toBe("ahmed-al-said");
  });

  it("keeps digits that are part of the name", () => {
    expect(slugifyOrgName("Store 24")).toBe("store-24");
  });

  it("drops apostrophes instead of breaking the word", () => {
    expect(slugifyOrgName("O'Brien Pharmacy")).toBe("obrien-pharmacy");
  });

  it("folds accents to their base letters rather than losing them", () => {
    expect(slugifyOrgName("José Clinic")).toBe("jose-clinic");
  });

  it("never leaves a leading or trailing dash", () => {
    const slug = slugifyOrgName("  ***Mixed Case***  ");
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
  });

  describe("names with no ASCII in them", () => {
    it("does not emit Arabic, which the /{org} route cannot match", () => {
      const slug = slugifyOrgName("محمد علي", { seed: "haitham-probe-local" });
      expect(slug).toBe("haitham-probe-local");
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    });

    it("keeps the seed as given, so an email local part stays short", () => {
      // Callers pass the local part, not the whole address, precisely so the
      // URL reads "haitham" rather than "haitham-gmail-com".
      expect(slugifyOrgName("محمد", { seed: "haitham" })).toBe("haitham");
    });

    it("falls back deterministically so the same person keeps the same URL", () => {
      const first = slugifyOrgName("محمد");
      const second = slugifyOrgName("محمد");
      expect(first).toBe(second);
      expect(first).toMatch(/^org-[0-9a-z]+$/);
    });

    it("gives two different non-Latin names different URLs", () => {
      expect(slugifyOrgName("محمد")).not.toBe(slugifyOrgName("فاطمة"));
    });

    it("copes with CJK and emoji, which slugify to nothing at all", () => {
      for (const name of ["東京商店", "🏪 Store", "🙂", "---", "   "]) {
        expect(isValidOrgSlug(slugifyOrgName(name, { seed: "probe@x.io" }))).toBe(true);
      }
    });
  });

  describe("routability", () => {
    it("refuses to shadow the app's own top-level routes", () => {
      expect(slugifyOrgName("Systems")).toBe("org-systems");
      expect(slugifyOrgName("Sign In")).toBe("sign-in");
      expect(slugifyOrgName("api")).toBe("org-api");
    });

    it("does not produce a bare number that reads like a row id", () => {
      expect(slugifyOrgName("404")).toBe("org-404");
    });

    it("keeps a single-character name routable", () => {
      // SLUG_RE needs at least two characters, so a bare "a" would 404.
      expect(isValidOrgSlug(slugifyOrgName("A"))).toBe(true);
    });
  });

  describe("template prefix", () => {
    it("composes a template-prefixed slug and still validates", () => {
      const slug = slugifyOrgName("مؤسسة محمد", {
        seed: "haitham@probe.local",
        prefix: "grocery",
      });
      expect(slug).toBe("grocery-haitham-probe-local");
      expect(isValidOrgSlug(slug)).toBe(true);
    });

    it("cannot be pushed out of the length cap by the prefix", () => {
      const slug = slugifyOrgName("a".repeat(80), { prefix: "clinic" });
      expect(slug.length).toBeLessThanOrEqual(40);
      expect(isValidOrgSlug(slug)).toBe(true);
    });
  });

  it("is a valid slug for every input in a hostile corpus", () => {
    const corpus = [
      null,
      undefined,
      "",
      "   ",
      "A",
      "..",
      "../etc/passwd",
      "profile",
      "-leading",
      "trailing-",
      "UPPER CASE",
      "tabs\tand\nnewlines",
      "a".repeat(300),
      "🎉",
      "Ünïcödé",
      "123",
      "select-org",
    ];
    for (const input of corpus) {
      const slug = slugifyOrgName(input, { seed: "seed@probe.local" });
      expect(isValidOrgSlug(slug), `input=${JSON.stringify(input)} slug=${slug}`).toBe(true);
    }
  });
});

describe("capSlug", () => {
  it("trims without leaving a trailing dash", () => {
    // The cap can land exactly on the dash that follows a word.
    expect(capSlug("abcdefghij-kl", 11)).toBe("abcdefghij");
  });
});

describe("ensureUniqueOrgSlug", () => {
  const free = async () => null;
  const taken = (takenSlug: string) => async (slug: string) =>
    slug === takenSlug ? { id: "x" } : null;

  it("returns the base slug when it is free", async () => {
    expect(await ensureUniqueOrgSlug(free, "ahmed")).toBe("ahmed");
  });

  it("counts up rather than randomising, so URLs stay guessable", async () => {
    const takenTwo = async (slug: string) =>
      slug === "ahmed" || slug === "ahmed-2" ? { id: "x" } : null;
    expect(await ensureUniqueOrgSlug(takenTwo, "ahmed")).toBe("ahmed-3");
  });

  it("keeps the suffixed slug inside the length cap", async () => {
    const base = "a".repeat(40);
    const takenBase = taken(base);
    const slug = await ensureUniqueOrgSlug(takenBase, base);
    expect(slug).toBe(`${base}-2`);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(isValidOrgSlug(slug)).toBe(true);
  });

  it("falls back to a random suffix only after the counter is exhausted", async () => {
    const alwaysTaken = async () => ({ id: "x" });
    const slug = await ensureUniqueOrgSlug(alwaysTaken, "ahmed");
    expect(slug).not.toBe("ahmed");
    expect(isValidOrgSlug(slug)).toBe(true);
  });
});
