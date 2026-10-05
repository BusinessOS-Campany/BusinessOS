import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  displayDial,
  displayIdentifier,
  findCountry,
  flagEmoji,
  formatInternational,
  internalAuthEmail,
  isInternalAuthEmail,
  resolveIdentifier,
  searchCountries,
} from "@/core/auth/identifier";

describe("country dial codes", () => {
  it("exposes Yemen as the default with +967", () => {
    expect(DEFAULT_COUNTRY).toBe("YE");
    expect(findCountry(DEFAULT_COUNTRY)).toMatchObject({ dial: "967", nameAr: "اليمن" });
  });

  it("looks countries up case-insensitively and rejects unknown codes", () => {
    expect(findCountry("ye")?.code).toBe("YE");
    expect(findCountry("ZZ")).toBeNull();
    expect(findCountry(null)).toBeNull();
  });

  it("covers the whole world, with unique ISO codes and numeric dial codes", () => {
    // Dial codes are deliberately NOT unique: +1 covers the whole NANP, +7 is
    // shared by Russia and Kazakhstan, +44 by the UK/Crown dependencies, and so
    // on. Uniqueness is asserted on the ISO code, which is what the schema and
    // the picker key on.
    expect(COUNTRIES.length).toBeGreaterThan(200);
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) {
      expect(c.dial).toMatch(/^\d+$/);
      expect(c.nameAr.trim().length).toBeGreaterThan(0);
    }
  });

  it("renders a flag from the ISO code and formats NANP area codes", () => {
    expect(flagEmoji("YE")).toBe("\u{1F1FE}\u{1F1EA}");
    expect(flagEmoji("ye")).toBe("\u{1F1FE}\u{1F1EA}");
    // Shape guard only: this validates that a code is two letters, NOT that it is
    // an assigned ISO code — "ZZ" is well-formed and so does produce a flag.
    expect(flagEmoji("Y")).toBe("");
    expect(flagEmoji("12")).toBe("");
    expect(flagEmoji("")).toBe("");

    // +1 alone cannot tell 23 territories apart, so the area code is shown.
    expect(displayDial(findCountry("AI")!)).toBe("+1 264");
    expect(displayDial(findCountry("US")!)).toBe("+1");
    expect(displayDial(findCountry("YE")!)).toBe("+967");
  });

  it("keeps the NANP area code out of the dialling prefix it is stored against", () => {
    // Anguila is country code +1, and the 264 is part of the phone number, so
    // formatting must not double-count it.
    expect(findCountry("AI")).toMatchObject({ dial: "1", area: "264" });
    expect(formatInternational("2645551234", "AI")).toBe("+12645551234");
  });
});

describe("resolveIdentifier", () => {
  it("classifies an email and lowercases it", () => {
    expect(resolveIdentifier("  Ahmad@Example.COM ")).toEqual({
      kind: "email",
      email: "ahmad@example.com",
      phone: null,
      countryCode: null,
    });
  });

  it("rejects an empty value", () => {
    expect(resolveIdentifier("   ")).toEqual({ error: "empty" });
  });

  it("rejects a malformed email", () => {
    expect(resolveIdentifier("nope@")).toEqual({ error: "invalid" });
    expect(resolveIdentifier("a@b")).toEqual({ error: "invalid" });
  });

  it("normalises a bare Yemeni number to digits plus the ISO code", () => {
    expect(resolveIdentifier("777123456", "YE")).toEqual({
      kind: "phone",
      email: null,
      phone: "777123456",
      countryCode: "YE",
    });
  });

  it("strips a dial code the user typed themselves", () => {
    for (const typed of ["+967777123456", "967777123456", "+967 777 123 456"]) {
      expect(resolveIdentifier(typed, "YE")).toMatchObject({ kind: "phone", phone: "777123456" });
    }
  });

  it("drops a leading local zero", () => {
    expect(resolveIdentifier("0777123456", "YE")).toMatchObject({ phone: "777123456" });
  });

  it("strips spaces, dashes and brackets", () => {
    expect(resolveIdentifier("+967 (777) 123-456", "YE")).toMatchObject({ phone: "777123456" });
  });

  it("requires a country for a phone", () => {
    expect(resolveIdentifier("777123456")).toEqual({ error: "invalid" });
    expect(resolveIdentifier("777123456", "ZZ")).toEqual({ error: "invalid" });
  });

  it("rejects a number that is too short", () => {
    expect(resolveIdentifier("123", "YE")).toEqual({ error: "invalid" });
  });
});

describe("country search", () => {
  it("returns the whole list for an empty query", () => {
    expect(searchCountries("")).toHaveLength(COUNTRIES.length);
    expect(searchCountries("   ")).toHaveLength(COUNTRIES.length);
  });

  it("finds a country by Arabic name", () => {
    const hits = searchCountries("اليمن");
    expect(hits.map((c) => c.code)).toContain("YE");
  });

  it("finds a country by dialling code, with or without a +", () => {
    expect(searchCountries("967").map((c) => c.code)).toContain("YE");
    expect(searchCountries("+967").map((c) => c.code)).toContain("YE");
    expect(searchCountries("+967").map((c) => c.code)).toContain("YE");
  });

  it("finds a country by ISO code, case-insensitively", () => {
    expect(searchCountries("ye").map((c) => c.code)).toContain("YE");
    expect(searchCountries("SA").map((c) => c.code)).toContain("SA");
  });

  it("finds NANP territories by their area code", () => {
    // "+1" alone is 23 countries; "264" must isolate Anguilla.
    expect(searchCountries("1").length).toBeGreaterThan(20);
    const anguilla = searchCountries("264").map((c) => c.code);
    expect(anguilla).toContain("AI");
    expect(anguilla).not.toContain("US");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchCountries("zzzzz")).toHaveLength(0);
  });
});

describe("internal auth address", () => {
  it("is deterministic for the same country and number", () => {
    expect(internalAuthEmail("777123456", "YE")).toBe("p967777123456@phone.bos.local");
    expect(internalAuthEmail("777123456", "YE")).toBe(internalAuthEmail("777123456", "YE"));
  });

  it("differs per country so the same local number is not one account", () => {
    expect(internalAuthEmail("777123456", "YE")).not.toBe(internalAuthEmail("777123456", "SA"));
  });

  it("is flagged so it is never displayed or mailed", () => {
    expect(isInternalAuthEmail("p967777123456@phone.bos.local")).toBe(true);
    expect(isInternalAuthEmail("ahmad@example.com")).toBe(false);
    expect(isInternalAuthEmail(null)).toBe(false);
  });
});

describe("displayIdentifier", () => {
  it("prefers a real email", () => {
    expect(displayIdentifier({ email: "a@b.com", phone: "777123456", countryCode: "YE" })).toBe("a@b.com");
  });

  it("falls back to the international phone when only the stand-in exists", () => {
    expect(
      displayIdentifier({ email: "p967777123456@phone.bos.local", phone: "777123456", countryCode: "YE" }),
    ).toBe("+967777123456");
  });

  it("formats the full international number", () => {
    expect(formatInternational("777123456", "YE")).toBe("+967777123456");
    expect(formatInternational(null, "YE")).toBeNull();
  });
});
