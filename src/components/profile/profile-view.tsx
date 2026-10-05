"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { dictionaries, t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import {
  PROFILE_TABS,
  type ProfileActivity,
  type ProfileOrgContext,
  type ProfileOverview,
  type ProfileSystem,
  type ProfileTab,
} from "@/core/profile/types";
import { cn } from "@/lib/utils";
import { useProfile, type ProfileController } from "./use-profile";
import { ProfileHeader } from "./profile-header";
import { ProfileOverviewPanel, SystemGrid } from "./profile-overview-panel";
import { ProfileActivityPanel } from "./profile-activity-panel";
import { ProfileSecurityPanel } from "./profile-security-panel";
import { ProfileEditor } from "./profile-editor";
import { orgStatus, roleLabel } from "./labels";
import { formatDate, formatNumber } from "@/core/profile/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Client shell for /profile.
 *
 * The server already passed the first `ProfileOverview`, so there is no loading
 * state on the happy path. The tab lives in the URL (`?tab=…`) rather than in
 * component state, so a tab is linkable, survives reload and works with the
 * browser's back button.
 */

const TAB_ICON: Record<ProfileTab, string> = {
  overview: "◈",
  activity: "⚡",
  organizations: "🏢",
  systems: "🧩",
  security: "🔐",
};

interface Props {
  dir: "rtl" | "ltr";
  locale: Locale;
  tab: ProfileTab;
  /** The active org's add-system surface; absent on the bare `/profile`. */
  orgContext?: ProfileOrgContext;
  initial: ProfileOverview | null;
  initialActivity: ProfileActivity | null;
  activityLoadFailed: boolean;
  loadError: string | null;
}

export function ProfileView({ dir, locale, tab, orgContext, initial, initialActivity, activityLoadFailed, loadError }: Props) {
  const dict = dictionaries[locale];
  const controller = useProfile(initial, loadError, locale, initialActivity, activityLoadFailed);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [editorOpen, setEditorOpen] = useState(false);
  // Bumped on every open so the editor remounts from the current server
  // snapshot. A cancelled edit must not leak into the next open, and the
  // dialog's own onOpenChange never fires for a parent-driven open.
  const [editorEpoch, setEditorEpoch] = useState(0);
  const openEditor = () => {
    setEditorEpoch((n) => n + 1);
    setEditorOpen(true);
  };

  const selectTab = (next: ProfileTab) => {
    if (next === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (controller.loadError && !controller.overview) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center" dir={dir}>
        <p className="text-sm text-destructive">{controller.loadError}</p>
        <Button className="mt-4" variant="outline" onClick={() => void controller.refresh()}>
          {t(dict, "common.retry")}
        </Button>
      </main>
    );
  }

  const overview = controller.overview;

  if (!overview) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16" dir={dir}>
        <div className="h-48 animate-pulse rounded-3xl bg-muted" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16" dir={dir}>
      <ProfileHeader
        dict={dict}
        locale={locale}
        dir={dir}
        overview={overview}
        controller={controller}
        onEdit={openEditor}
      />

      {/* Tabs */}
      <nav
        className="sticky top-0 z-20 -mx-4 mt-6 border-b border-border bg-background/85 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6"
        aria-label={t(dict, "profile.nav.overview")}
      >
        <ul className="flex gap-1 overflow-x-auto">
          {PROFILE_TABS.map((key) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => selectTab(key)}
                aria-current={key === tab ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  key === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span aria-hidden>{TAB_ICON[key]}</span>
                {t(dict, `profile.nav.${key}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Flash + persistent error. The toast self-fades via a CSS animation
          keyed on the message, so no timer/effect is needed. */}
      <div className="mt-4 space-y-2">
        {controller.flash ? (
          <p
            // Re-keying restarts the animation when a new message arrives.
            key={controller.flash}
            role="status"
            className="animate-[profile-flash_3.2s_ease-out_forwards] rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
          >
            {controller.flash}
          </p>
        ) : null}
        {controller.saveError ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {controller.saveError}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        {tab === "overview" ? (
          <ProfileOverviewPanel dict={dict} locale={locale} dir={dir} overview={overview} onEdit={openEditor} />
        ) : null}

        {tab === "activity" ? (
          <ProfileActivityPanel
            dict={dict}
            locale={locale}
            activity={controller.activity}
            loading={controller.activityLoading}
            error={controller.activityError}
            page={controller.activityPage}
            controller={controller}
          />
        ) : null}

        {tab === "organizations" ? <OrganizationsTab dict={dict} locale={locale} overview={overview} /> : null}

        {tab === "systems" ? (
          <SystemsTab
            dict={dict}
            locale={locale}
            overview={overview}
            orgContext={orgContext}
            controller={controller}
          />
        ) : null}

        {tab === "security" ? (
          <ProfileSecurityPanel dict={dict} locale={locale} overview={overview} controller={controller} />
        ) : null}
      </div>

      <ProfileEditor
        key={editorEpoch}
        dict={dict}
        locale={locale}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        overview={overview}
        controller={controller}
      />
    </main>
  );
}

function OrganizationsTab({
  dict,
  locale,
  overview,
}: {
  dict: Dictionary;
  locale: Locale;
  overview: ProfileOverview;
}) {
  if (overview.organizations.length === 0) {
    return <EmptyState title={t(dict, "profile.orgs.empty")} hint={t(dict, "profile.orgs.emptyHint")} />;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {overview.organizations.map((org) => {
        const status = orgStatus(dict, org.status);
        return (
          <li key={org.id}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg">
                    {org.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- tenant logo, arbitrary remote host
                      <img src={org.logo} alt="" className="size-7 rounded object-contain" />
                    ) : (
                      "🏢"
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{org.name}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                      {org.slug}
                    </p>
                  </div>
                  <Badge variant={status.tone === "danger" ? "destructive" : status.tone === "success" ? "success" : "secondary"}>
                    {status.label}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{roleLabel(dict, org.role)}</Badge>
                  {org.isOwner ? <Badge variant="default">{t(dict, "profile.orgs.owner")}</Badge> : null}
                  {org.planName ? (
                    <Badge variant="outline" dir={locale === "ar" ? "rtl" : "ltr"}>
                      {org.planName}
                    </Badge>
                  ) : null}
                </div>

                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <dt>{t(dict, "profile.orgs.systems")}:</dt>
                    <dd className="tabular-nums text-foreground">{formatNumber(org.systemCount, locale)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{t(dict, "profile.orgs.members")}:</dt>
                    <dd className="tabular-nums text-foreground">{formatNumber(org.memberCount, locale)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{t(dict, "profile.orgs.joined")}:</dt>
                    <dd className="text-foreground">{formatDate(org.joinedAt, locale)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function SystemsTab({
  dict,
  locale,
  overview,
  orgContext,
  controller,
}: {
  dict: Dictionary;
  locale: Locale;
  overview: ProfileOverview;
  orgContext?: ProfileOrgContext;
  controller: ProfileController;
}) {
  // Only the org in the URL may be renamed — the other orgs in the list belong
  // to other tenants, and the endpoint scopes the write to the active one.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // The system whose password is being confirmed, or null when none is. Lifted
  // here for the same reason the rename id is: one dialog at a time, and the
  // grid stays controlled.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const editableOrgId = orgContext?.organizationId;

  // Group by owning organization so a user in several tenants can tell which
  // install belongs to where.
  const byOrg = new Map<string, ProfileOverview["systems"]>();
  for (const system of overview.systems) {
    const list = byOrg.get(system.organizationName) ?? [];
    list.push(system);
    byOrg.set(system.organizationName, list);
  }

  return (
    <div className="space-y-5">
      {orgContext ? (
        <AddSystemSection dict={dict} locale={locale} org={orgContext} />
      ) : null}

      {byOrg.size > 0 ? (
        [...byOrg.entries()].map(([orgName, systems]) => {
          // The PATCH is scoped to the org in the URL, so only that org's group
          // gets the rename affordance — the rest belong to other tenants.
          const isActiveOrg = Boolean(editableOrgId) && systems[0]?.organizationId === editableOrgId;
          return (
          <section key={orgName}>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              {orgName}
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                {formatNumber(systems.length, locale)}
              </span>
            </h2>
            <SystemGrid
              systems={systems}
              dict={dict}
              locale={locale}
              renamingId={isActiveOrg ? renamingId : null}
              onToggleRename={isActiveOrg ? setRenamingId : undefined}
              onRename={
                isActiveOrg
                  ? (system, nextName) => {
                      void controller.renameSystem(system.id, nextName).then((ok) => {
                        if (ok) setRenamingId(null);
                      });
                    }
                  : undefined
              }
              onReClone={
                isActiveOrg
                  ? (system) => {
                      void controller.reCloneSystem(system.id);
                    }
                  : undefined
              }
              onActivateAccess={
                isActiveOrg
                  ? (system) => {
                      setConfirmingId(system.id);
                    }
                  : undefined
              }
            />
            {systems
              .filter((system) => isActiveOrg && system.id === confirmingId)
              .map((system) => (
                <ConfirmCredentialForm
                  key={system.id}
                  dict={dict}
                  system={system}
                  controller={controller}
                  onDone={() => setConfirmingId(null)}
                />
              ))}
          </section>
          );
        })
      ) : (
        <EmptyState title={t(dict, "profile.systems.empty")} hint={t(dict, "profile.systems.emptyHint")} />
      )}
    </div>
  );
}

/**
 * One-time password confirmation that turns on direct sign-in for a system.
 *
 * The password goes to the server, is checked against the platform's own
 * credential store, and is never stored in the browser or sent anywhere else. It
 * is deliberately a form rather than a prompt() so the field is a real password
 * input and the error lands on the page.
 */
function ConfirmCredentialForm({
  dict,
  system,
  controller,
  onDone,
}: {
  dict: Dictionary;
  system: ProfileSystem;
  controller: ProfileController;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const label = system.displayName ?? system.name;

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void controller.confirmSystemCredential(system.id, password).then((result) => {
          if (result.ok) {
            // Cleared on success only: a failure keeps the field so the member can
            // retype, and `type=password` means the value is never readable after.
            setPassword("");
            onDone();
            return;
          }
          setError(result.error);
        });
      }}
    >
      <p className="text-sm font-semibold text-foreground">{t(dict, "profile.systems.accessActivateTitle")}</p>
      <p className="text-xs text-muted-foreground">{t(dict, "profile.systems.accessActivateHint")}</p>
      <label className="block text-xs font-medium text-muted-foreground" htmlFor={`confirm-${system.id}`}>
        {t(dict, "profile.security.currentPassword")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`confirm-${system.id}`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={label}
          className="min-w-48 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <Button type="submit" size="sm" disabled={controller.saving || password.length === 0}>
          {t(dict, "profile.systems.accessActivateSave")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={controller.saving}>
          {t(dict, "profile.systems.accessCancel")}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

/** The org-scoped "add a system" affordance: one button into the org's system
 *  marketplace (where the system is actually picked), plus the platform-admin
 *  requests this org is already waiting on. */
function AddSystemSection({
  dict,
  locale,
  org,
}: {
  dict: Dictionary;
  locale: Locale;
  org: ProfileOrgContext;
}) {
  const displayName = (e: { name: string; nameAr: string | null }) =>
    locale === "ar" ? (e.nameAr ?? e.name) : e.name;

  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t(dict, "profile.systems.addTitle")}</h2>
      <Link
        href={`/${org.organizationSlug}/my-apps`}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary/90"
      >
        {t(dict, "profile.systems.browse")}
        <span aria-hidden className="rtl:rotate-180">
          ←
        </span>
      </Link>

      {org.pending.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <p className="font-medium">{t(dict, "profile.systems.review")}</p>
          <p className="mt-0.5">{org.pending.map(displayName).join(locale === "ar" ? "، " : ", ")}</p>
          <p className="mt-0.5 text-xs opacity-80">{t(dict, "profile.systems.reviewHint")}</p>
        </div>
      ) : null}
    </section>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <Card>
      <CardContent className="py-14 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
