import { domainToASCII } from "node:url";
import { prisma } from "@/core/db/client";

/**
 * Tenant host resolution. Two mechanisms map a request host to an organization:
 *
 *  1. Platform subdomain — `{orgSlug}.{baseDomain}` (works in dev and prod,
 *     derived from NEXT_PUBLIC_APP_URL).
 *  2. Custom domain — exact host match against the organization's configured
 *     `settings.domains` (customer points their own domain at the platform).
 *
 * The root domain (no subdomain) is the platform itself and has no tenant.
 */
function baseHost(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

/** Hostname of the platform itself (e.g. `businessoscompany.dpdns.org`). */
export function getPlatformBaseHost(): string {
  return baseHost();
}

/** True when the host is the platform or one of its direct subdomains. */
export function isPlatformDomain(host: string): boolean {
  const base = baseHost();
  return host === base || host.endsWith(`.${base}`);
}

/** Returns the leading subdomain label, or null when there is none. */
export function tenantSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const base = baseHost().toLowerCase();
  if (hostname === base) return null;
  if (!hostname.endsWith(`.${base}`)) return null;
  const slug = hostname.slice(0, -(base.length + 1));
  if (!slug || slug.includes(".")) return null; // single-level subdomain only
  return slug;
}

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Canonicalizes a user-entered custom domain: lowercase, punycode-encoded,
 * scheme/path/port stripped. Returns null when structurally unusable.
 */
export function normalizeCustomDomain(input: string): string | null {
  let raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  raw = raw.split(/[/?#]/)[0] ?? "";
  raw = raw.replace(/:\d+$/, "").replace(/\.+$/, "");
  if (!raw || raw.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(raw)) return null;
  let ascii: string;
  try {
    ascii = domainToASCII(raw);
  } catch {
    return null;
  }
  return ascii && ascii.length <= 253 ? ascii : null;
}

/**
 * Shared cookie domain for tenant subdomains, derived from the platform BASE
 * app URL (e.g. `https://businessoscompany.dpdns.org` → its hostname). Pass
 * the base URL — never a tenant subdomain — so one `Domain=` cookie is sent
 * to both the root and every `{slug}.` host (OAuth round-trips through the
 * root stay logged in on the subdomain). Null on localhost/IP/junk, where
 * browsers reject `Domain=` cookies and host-only cookies are correct.
 */
export function subdomainCookieDomain(appUrl?: string): string | null {
  const raw = appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  let hostname: string;
  try {
    hostname = new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return null;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || !hostname.includes(".")) return null;
  return hostname;
}

/**
 * Absolute URL of a tenant's platform subdomain (`https://<slug>.<base>`).
 * Used to bounce root-host logins straight into the org's profile
 * (`…/select-org` → auto-activate → `…/profile`). Null on localhost/IP/junk
 * or an invalid slug — callers fall through to existing behavior (dev stays
 * single-host). Pass the base explicitly in tests; defaults to the app URL.
 */
export function tenantSubdomainUrl(slug: string, base?: string): string | null {
  const clean = (slug ?? "").toLowerCase().trim();
  if (!clean || !DOMAIN_LABEL.test(clean)) return null;
  const raw = base ?? baseHost();
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    host = raw.toLowerCase();
  }
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes(".")) return null;
  return `https://${clean}.${host}`;
}

/** A valid custom hostname with at least two labels (registrable-looking). */
export function isValidCustomDomain(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return false;
  return host.split(".").every((label) => DOMAIN_LABEL.test(label));
}

export interface TenantByHost {
  organizationId: string;
  slug: string;
  name: string;
  logo: string | null;
  branding: { primary?: string; accent?: string; radius?: number; logoUrl?: string; displayNameOverride?: string } | undefined;
  locale: "ar" | "en";
}

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  status: string;
  settings: unknown;
}

function toTenantByHost(org: OrgRow): TenantByHost {
  const settings = (org.settings ?? {}) as {
    locale?: "ar" | "en";
    branding?: TenantByHost["branding"];
  };
  return {
    organizationId: org.id,
    slug: org.slug,
    name: settings.branding?.displayNameOverride ?? org.name,
    logo: settings.branding?.logoUrl ?? org.logo,
    branding: settings.branding,
    locale: settings.locale ?? "ar",
  };
}

const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  logo: true,
  status: true,
  settings: true,
} as const;

/** Resolves the tenant org matching a configured custom domain. */
export async function resolveTenantByCustomDomain(hostname: string): Promise<TenantByHost | null> {
  const org = await prisma.organization.findFirst({
    where: { settings: { path: ["domains"], array_contains: [hostname] } },
    select: TENANT_SELECT,
  });
  return org ? toTenantByHost(org) : null;
}

/** Resolves the tenant org from the current Host header. Null on the root domain. */
export async function resolveTenantByHost(
  host: string | null | undefined,
): Promise<TenantByHost | null> {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();

  // Custom domain: exact match against org settings.domains.
  if (!isPlatformDomain(hostname)) return resolveTenantByCustomDomain(hostname);

  const slug = tenantSlugFromHost(host);
  if (!slug) return null;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: TENANT_SELECT,
  });
  return org ? toTenantByHost(org) : null;
}