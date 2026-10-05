import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth/server";
import { getDictAndDir } from "@/core/i18n/server";
import { t } from "@/core/i18n/dictionaries";
import {
  getProfileActivity,
  getProfileOverview,
  requireProfileSession,
  type ProfileTab,
} from "@/core/profile/service";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { ProfileView } from "@/components/profile/profile-view";
import type { ProfileOrgContext } from "@/core/profile/types";

/**
 * The signed-in user's own profile, rendered inside an org context.
 *
 * Shared by `/profile` and `/{orgSlug}/profile` so there is exactly one
 * implementation of the page and one place the session gate lives. The org does
 * not change *whose* profile this is — it is still strictly the caller's own
 * profile, read from the session and never from a parameter — it only decides
 * which tenant context the page is rendered under.
 *
 * `orgContext` is the add-system surface for the active org: present on
 * `/{org}/profile` (the canonical URL) and absent on the bare `/profile`, where
 * no single org can claim the request buttons.
 */
export async function ProfileScreen({ tab, orgContext }: { tab: ProfileTab; orgContext?: ProfileOrgContext }) {
  // Real server-side gate. An earlier version rendered for anonymous visitors.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session) {
    // The org segment is preserved, so signing in returns the member to
    // `/{org}/profile` rather than dropping them on the org-less alias with no
    // systems tab, no add-system button and no rename rights.
    const next = orgContext ? `/${orgContext.organizationSlug}/profile` : "/profile";
    redirect(`/signin?next=${encodeURIComponent(next)}`);
  }

  const { dict, locale, dir } = await getDictAndDir();

  // Single source of truth for the first paint; the client refetches the same
  // shape after a mutation, so SSR and client can never disagree.
  let overview = null;
  let loadError: string | null = null;
  try {
    overview = await getProfileOverview(await requireProfileSession(await headers()));
  } catch {
    loadError = t(dict, "profile.error.load");
  }

  // Activity is server-loaded whenever the activity tab is the landing tab, so
  // a shared `?tab=activity` link arrives populated instead of flashing a
  // skeleton. Pagination then appends on the client.
  let activity = null;
  let activityLoadFailed = false;
  if (tab === "activity" && overview) {
    try {
      activity = await getProfileActivity(overview.identity.id, 1);
    } catch {
      // Non-fatal, but the client has to be told: with no data and no error the
      // activity panel would render its loading skeleton indefinitely.
      activityLoadFailed = true;
    }
  }

  return (
    <OnboardingShell
      variant="auto"
      labels={{
        signIn: t(dict, "profile.shell.signIn"),
        systems: t(dict, "profile.shell.systems"),
        copyright: t(dict, "profile.shell.copyright"),
        themeToLight: t(dict, "profile.shell.themeToLight"),
        themeToDark: t(dict, "profile.shell.themeToDark"),
      }}
    >
      <ProfileView
        dir={dir}
        locale={locale}
        tab={tab}
        orgContext={orgContext}
        initial={overview}
        initialActivity={activity}
        activityLoadFailed={activityLoadFailed}
        loadError={loadError}
      />
    </OnboardingShell>
  );
}
