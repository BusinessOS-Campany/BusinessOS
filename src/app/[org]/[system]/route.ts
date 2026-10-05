import { NextResponse } from "next/server";
import { listSystemSources } from "@/core/org-vault/system-sources";
import { relayCookies } from "@/core/systems/runtime/cookies";
import { proxySystemRequest } from "@/core/systems/runtime/proxy";
import { resolveSystemRequestScope, respondToScopeProblem } from "@/core/systems/runtime/scope";

/**
 * An org's own copy of a system, at its root: `/{org}/{system}`.
 *
 * The org is the one in the URL, and what is actually served is the customer's
 * own code from `orginazition/<org>/systems/<system>/`, running in its own
 * process against its own database. Nothing here renders a platform page.
 *
 * `src/app/[org]/layout.tsx` does not cover this route: a `route.ts` is a
 * terminal endpoint, so the layouts above it never run. That is why the org is
 * resolved and authorized here instead of inherited.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ org: string; system: string }> };

export const GET = (request: Request, ctx: Ctx) => forward(request, ctx);
export const POST = (request: Request, ctx: Ctx) => forward(request, ctx);
export const PUT = (request: Request, ctx: Ctx) => forward(request, ctx);
export const PATCH = (request: Request, ctx: Ctx) => forward(request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => forward(request, ctx);

async function forward(request: Request, ctx: Ctx): Promise<Response> {
  const { org, system } = await ctx.params;

  // A segment with no source folder is not a system, so `/{org}/anything` never
  // reaches the runtime machinery.
  if (!listSystemSources().includes(system)) {
    return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
  }

  const resolved = await resolveSystemRequestScope(org);
  if (resolved.kind !== "ok") {
    return respondToScopeProblem(resolved, org, system);
  }

  const { response, setCookies } = await proxySystemRequest(system, [], request, resolved.scope);
  await relayCookies(setCookies);
  return response;
}
