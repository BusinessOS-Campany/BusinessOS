import { NextResponse } from "next/server";
import { sharedPrisma } from "@/core/db/client";
import { resolveTenantContext } from "@/core/tenancy/context";
import { orgSystemPath } from "@/core/systems/runtime/urls";

/**
 * The old `/app/<system>/<anything>` entry point, now only a redirect to the
 * org-scoped path that replaced it. See `./route.ts` for why.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ system: string; path: string[] }> };

export const GET = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const POST = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const PUT = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const PATCH = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => redirect(request, ctx);

async function redirect(request: Request, ctx: Ctx): Promise<Response> {
  const { system, path } = await ctx.params;

  const resolution = await resolveTenantContext(request);
  if (!resolution) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in to open this system" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const org = await sharedPrisma.organization.findUnique({
    where: { id: resolution.tenant.organizationId },
    select: { slug: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: { code: "ORG_NOT_FOUND", message: "Organization not found" } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const target = new URL(`${orgSystemPath(org.slug, system)}/${path.map(encodeURIComponent).join("/")}`, request.url);
  target.search = new URL(request.url).search;

  return NextResponse.redirect(target, { status: 308 });
}
