import { describe, expect, it, afterEach } from "vitest";
import { orgDatabaseName, orgDatabaseUrl } from "@/core/org-vault/database";

const ORIGINAL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
});

describe("org database naming", () => {
  it("is named after the org's vault folder", () => {
    expect(orgDatabaseName("p967775008926")).toBe("org_p967775008926");
  });

  it("keeps the name inside PostgreSQL's 63-byte limit", () => {
    const name = orgDatabaseName("x".repeat(200));
    expect(name.length).toBe(63);
    expect(name.startsWith("org_")).toBe(true);
  });

  it("cannot be steered into another org's name by folder punctuation", () => {
    // Whatever separators the folder has, the result is one identifier built
    // from the same sanitised text the vault itself uses.
    const name = orgDatabaseName("acme-store_01");
    expect(name).toBe("org_acme-store_01");
  });
});

describe("org database url", () => {
  it("points at the org's own database on the shared server", () => {
    process.env.DATABASE_URL = "postgresql://postgres:secret@db.internal:5433/businessos?schema=businessos";
    const url = new URL(orgDatabaseUrl("p967775008926")!);

    expect(url.host).toBe("db.internal:5433");
    expect(url.username).toBe("postgres");
    expect(url.password).toBe("secret");
    expect(url.pathname).toBe("/org_p967775008926");
  });

  it("drops the platform's schema so the org's own migrations decide the layout", () => {
    process.env.DATABASE_URL = "postgresql://postgres:secret@localhost:5432/businessos?schema=businessos";
    expect(orgDatabaseUrl("p967775008926")).not.toContain("schema=");
  });

  it("keeps unrelated query parameters", () => {
    process.env.DATABASE_URL = "postgresql://u@h:5432/businessos?schema=businessos&sslmode=require";
    const url = new URL(orgDatabaseUrl("acme")!);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("schema")).toBeNull();
  });

  it("returns null rather than guessing when DATABASE_URL is unset or unusable", () => {
    delete process.env.DATABASE_URL;
    expect(orgDatabaseUrl("p967775008926")).toBeNull();

    process.env.DATABASE_URL = "not a url";
    expect(orgDatabaseUrl("p967775008926")).toBeNull();
  });

  it("never returns the platform's database for an org", () => {
    process.env.DATABASE_URL = "postgresql://postgres:secret@localhost:5432/businessos?schema=businessos";
    const url = orgDatabaseUrl("p967775008926")!;
    expect(url).toContain("org_p967775008926");
    expect(url).not.toContain("/businessos");
  });
});
