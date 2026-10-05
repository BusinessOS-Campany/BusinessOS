import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { postSignInPath } from "@/core/tenancy/org-route";

/** Reads the session cookie; must never be prerendered. */
export const dynamic = "force-dynamic";

/**
 * The single post-authentication decision point.
 *
 * Both the credential form and the social-provider round trip end up here rather
 * than each computing a destination. That matters because the answer depends on
 * data only the server has: whether the caller is a platform admin, which orgs
 * the user actually belongs to, and whether a `next` deep link is inside one of
 * them.
 *
 * Precedence is a platform admin (the console), then a validated `next`, then the
 * org itself for a one-org user, then the picker. A user with no orgs is sent to
 * provisioning, which creates one named after their account and opens it — the
 * picker is not an answer for them, because it renders an empty list and offers
 * no way to create an org.
 */
export default async function AuthLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    // No session: this is a stale or forged link. Start over, keeping the intent.
    redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  }

  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    select: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  // An admin holds a member row in a real customer org, so the org rules alone
  // would drop them into that customer's profile instead of the console.
  const target = postSignInPath({
    next,
    orgSlugs: memberships.map((m) => m.organization.slug),
    isPlatformAdmin: session.user.role === "admin",
  });
  redirect(target);
}
