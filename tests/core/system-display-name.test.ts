import { describe, expect, it } from "vitest";
import {
  SYSTEM_NAME_MAX,
  orgSystemDisplayName,
  parseOrgSystemDisplayName,
  withOrgSystemDisplayName,
} from "@/core/apps/settings";

/**
 * The per-org system name, tested as pure functions.
 *
 * This is the override that lets one customer call its grocery install
 * "البيانات الشخصية" while every other org keeps the catalog name, so the
 * security-relevant parts are: it must never read across orgs (it is stored per
 * `organizationApp` row), a hostile string must not reach a card heading, and a
 * rename must not wipe the other settings already on that row.
 */

describe("orgSystemDisplayName", () => {
  it("reads the override off the settings blob", () => {
    expect(orgSystemDisplayName({ displayName: "البيانات الشخصية" })).toBe("البيانات الشخصية");
  });

  it("falls back to null so the catalog name is used", () => {
    expect(orgSystemDisplayName(null)).toBeNull();
    expect(orgSystemDisplayName(undefined)).toBeNull();
    expect(orgSystemDisplayName({})).toBeNull();
    expect(orgSystemDisplayName({ displayName: "" })).toBeNull();
    expect(orgSystemDisplayName({ displayName: "   " })).toBeNull();
    expect(orgSystemDisplayName({ displayName: 42 })).toBeNull();
    expect(orgSystemDisplayName("البيانات الشخصية")).toBeNull();
  });

  it("ignores an override too long to be a real name", () => {
    expect(orgSystemDisplayName({ displayName: "x".repeat(SYSTEM_NAME_MAX + 1) })).toBeNull();
  });

  it("keeps other settings on the blob untouched", () => {
    expect(orgSystemDisplayName({ currency: "SAR", displayName: "نظام البقالة" })).toBe("نظام البقالة");
  });
});

describe("parseOrgSystemDisplayName", () => {
  it("trims and accepts Arabic or Latin names", () => {
    expect(parseOrgSystemDisplayName("  البيانات الشخصية  ")).toBe("البيانات الشخصية");
    expect(parseOrgSystemDisplayName("Grocery POS")).toBe("Grocery POS");
  });

  it("treats an empty submission as clearing the override", () => {
    expect(parseOrgSystemDisplayName("")).toBeNull();
    expect(parseOrgSystemDisplayName("   ")).toBeNull();
  });

  it("strips control characters and bidi overrides", () => {
    expect(parseOrgSystemDisplayName("البي\u0007انات")).toBe("البيانات");
    // U+202E reverses what follows it in a terminal: an anchor that reads
    // backwards is a spoof, and this string is rendered as a card heading.
    expect(parseOrgSystemDisplayName("A\u202EB")).toBe("AB");
  });

  it("refuses a name past the limit rather than storing it", () => {
    expect(() => parseOrgSystemDisplayName("x".repeat(SYSTEM_NAME_MAX + 1))).toThrow(/characters or fewer/);
    expect(parseOrgSystemDisplayName("x".repeat(SYSTEM_NAME_MAX))).toHaveLength(SYSTEM_NAME_MAX);
  });
});

describe("withOrgSystemDisplayName", () => {
  it("adds the name without dropping the settings already there", () => {
    expect(withOrgSystemDisplayName({ currency: "SAR" }, "البيانات الشخصية")).toEqual({
      currency: "SAR",
      displayName: "البيانات الشخصية",
    });
  });

  it("replaces a previous name instead of appending a second one", () => {
    expect(withOrgSystemDisplayName({ displayName: "قديم" }, "جديد")).toEqual({ displayName: "جديد" });
  });

  it("removes the key on clear and keeps the rest", () => {
    expect(withOrgSystemDisplayName({ currency: "SAR", displayName: "قديم" }, null)).toEqual({
      currency: "SAR",
    });
  });

  it("does not mutate the blob it was given", () => {
    const current = { currency: "SAR", displayName: "قديم" };
    withOrgSystemDisplayName(current, "جديد");
    expect(current).toEqual({ currency: "SAR", displayName: "قديم" });
  });
});
