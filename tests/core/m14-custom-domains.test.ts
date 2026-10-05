import "@/core/config/load-env";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/core/db/client";
import {
  getPlatformBaseHost,
  isPlatformDomain,
  isValidCustomDomain,
  normalizeCustomDomain,
  resolveTenantByHost,
  subdomainCookieDomain,
  tenantSlugFromHost,
  tenantSubdomainUrl,
} from "@/core/tenancy/host";

const TEST_DOMAIN = "store.example-verify.com";

describe("custom domain tenancy", () => {
  it("normalizes user-entered custom domains", () => {
    expect(normalizeCustomDomain(" https://Store.Example.com/login ")).toBe("store.example.com");
    expect(normalizeCustomDomain("www.BusinessOS.com:443")).toBe("www.businessos.com");
    expect(normalizeCustomDomain("grocery.mycompany.com.")).toBe("grocery.mycompany.com");
    expect(normalizeCustomDomain("")).toBeNull();
    expect(normalizeCustomDomain("not a domain!!")).toBe(null);
  });

  it("validates custom-domain shape", () => {
    expect(isValidCustomDomain("grocery.mycompany.com")).toBe(true);
    expect(isValidCustomDomain("mycompany.com")).toBe(true);
    expect(isValidCustomDomain("localhost")).toBe(false);
    expect(isValidCustomDomain("a..b.com")).toBe(false);
    expect(isValidCustomDomain("-x.com")).toBe(false);
  });

  it("distinguishes platform domains from custom domains", () => {
    const base = getPlatformBaseHost();
    expect(isPlatformDomain(base)).toBe(true);
    expect(isPlatformDomain(`a.${base}`)).toBe(true);
    expect(isPlatformDomain("store.custom-verify.com")).toBe(false);
  });

  it("maps platform subdomains to org slugs", () => {
    const base = getPlatformBaseHost();
    expect(tenantSlugFromHost(`hunter-1x.${base}`)).toBe("hunter-1x");
    expect(tenantSlugFromHost(base)).toBeNull();
    expect(tenantSlugFromHost("random.example.com")).toBeNull();
  });

  it("derives the shared cookie domain (null on localhost/IP/junk)", () => {
    expect(subdomainCookieDomain("https://businessoscompany.dpdns.org")).toBe(
      "businessoscompany.dpdns.org",
    );
    expect(subdomainCookieDomain("http://localhost:3100")).toBeNull();
    expect(subdomainCookieDomain("http://127.0.0.1:3100")).toBeNull();
    expect(subdomainCookieDomain("not a url")).toBeNull();
  });

  it("builds absolute tenant subdomain URLs (null on localhost/junk)", () => {
    expect(tenantSubdomainUrl("hitham-homaid", "businessoscompany.dpdns.org")).toBe(
      "https://hitham-homaid.businessoscompany.dpdns.org",
    );
    expect(tenantSubdomainUrl("HITHAM-HOMAID", "businessoscompany.dpdns.org")).toBe(
      "https://hitham-homaid.businessoscompany.dpdns.org",
    );
    expect(tenantSubdomainUrl("x", "localhost")).toBeNull();
    expect(tenantSubdomainUrl("x", "127.0.0.1")).toBeNull();
    expect(tenantSubdomainUrl("bad slug!", "businessoscompany.dpdns.org")).toBeNull();
  });

  it("resolves a tenant by its configured custom domain", async () => {
    const orgId = randomUUID();
    const slug = `domaintest-${randomUUID().slice(0, 10)}`;
    try {
      await prisma.organization.create({
        data: {
          id: orgId,
          name: "Domain Verify Org",
          slug,
          settings: { domains: [TEST_DOMAIN] } as never,
        },
      });

      const tenant = await resolveTenantByHost(TEST_DOMAIN);
      expect(tenant?.organizationId).toBe(orgId);
      expect(tenant?.slug).toBe(slug);

      const missing = await resolveTenantByHost("unconfigured.example-verify.com");
      expect(missing).toBeNull();
    } finally {
      try {
        await prisma.organization.delete({ where: { id: orgId } });
      } catch {
        /* already gone */
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});