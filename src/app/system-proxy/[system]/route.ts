import { NextResponse } from "next/server";
import { sharedPrisma } from "@/core/db/client";
import { resolveTenantContext } from "@/core/tenancy/context";
import { orgSystemPath } from "@/core/systems/runtime/urls";

/**
 * The old `/app/<system>` entry point, now only a redirect.
 *
 * A system belongs to an organization and is served under it — `/{org}/{system}`
 * — because that path is what the customer's process is mounted at and what its
 * own links and asset URLs are built from. `/app/<system>` never named an org,
 * so it could only ever guess one from the session, and the guess is made here
 * exactly once: a permanent redirect that preserves an old link or bookmark
 * without keeping a second way in.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ system: string }> };

export const GET = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const POST = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const PUT = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const PATCH = (request: Request, ctx: Ctx) => redirect(request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => redirect(request, ctx);

async function redirect(request: Request, ctx: Ctx): Promise<Response> {
  const { system } = await ctx.params;

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

  const incoming = new URL(request.url);
  const target = new URL(orgSystemPath(org.slug, system), request.url);
  // The old path was rewritten before it reached this handler, so the original
  // query string is still on the request; the sub-path was not, because the
  // catch-all rewrite is what forwards `/{system}/<rest>` here.
  target.search = incoming.search;

  return NextResponse.redirect(target, { status: 308 });
}
