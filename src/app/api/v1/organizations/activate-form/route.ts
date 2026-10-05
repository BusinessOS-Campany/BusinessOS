import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { onOrganizationOpened } from "@/core/org-vault/on-create";

const bodySchema = z.object({ organizationId: z.string().min(1) });

/**
 * Form-post friendly wrapper around setActiveOrganization for no-JS flows
 * (org picker). Redirects to the activated org's profile page on success.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const parsed = bodySchema.parse({ organizationId: form.get("organizationId") });
    const result = await auth.api.setActiveOrganization({
      body: { organizationId: parsed.organizationId },
      headers: request.headers,
      returnHeaders: true,
    });
    // The org being activated decides the destination. One index lookup; if the
    // org vanished mid-flight, fall back to the old behavior rather than 500.
    const org = await prisma.organization.findUnique({
      where: { id: parsed.organizationId },
      select: { slug: true },
    });
    // Switching org is "the customer opened their org": make sure `t_<slug>`
    // exists (loading database/<slug>.sql when it does not) before the redirect
    // sends them into the org, so their first page load already has a schema.
    if (org) await onOrganizationOpened(org);
    const profilePath = org ? `/${org.slug}/profile` : "/my-apps";
    const response = NextResponse.redirect(new URL(profilePath, request.url), { status: 303 });
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch {
    // Form-post flow: never leak JSON errors — send the user back to pick again.
    return NextResponse.redirect(new URL("/select-org?error=1", request.url), { status: 303 });
  }
}
