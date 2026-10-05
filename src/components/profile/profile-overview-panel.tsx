"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { appIcon } from "@/components/app-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import { formatDate, formatNumber } from "@/core/profile/format";
import { cn } from "@/lib/utils";
import { countryName, orgStatus, roleLabel, systemStatus } from "./labels";
import type { ProfileOverview, ProfileStatKey, ProfileSystem } from "@/core/profile/types";

/**
 * Overview tab. Everything is derived from the overview payload the server
 * already computed — the client does no aggregation of its own, so the numbers
 * here are the same numbers the API would return.
 */

const STAT_ICON: Record<ProfileStatKey, string> = {
  organizations: "🏢",
  systems: "🧩",
  sessions: "🔐",
  activity: "⚡",
};

/** Badge variants are a fixed set; the service reports semantic tones instead. */
const TONE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  neutral: "secondary",
};

interface Props {
  dict: Dictionary;
  locale: Locale;
  dir: "rtl" | "ltr";
  overview: ProfileOverview;
  onEdit: () => void;
}

export function ProfileOverviewPanel({ dict, locale, dir, overview, onEdit }: Props) {
  const { identity, stats, organizations, systems } = overview;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-3">
        {stats.map((stat) => (
          <Card key={stat.key} className="overflow-hidden">
            <CardContent className="flex items-center gap-3 p-4">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg">
                {STAT_ICON[stat.key]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  {t(dict, `profile.stats.${stat.key}`)}
                </p>
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {formatNumber(stat.value, locale)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account details */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">{t(dict, "profile.account.about")}</CardTitle>
            <CardDescription>{t(dict, "profile.account.subtitle")}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onEdit} disabled={identity.banned}>
            {t(dict, "profile.header.editProfile")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t(dict, "profile.account.fullName")}>{identity.name}</Row>
          <Row label={t(dict, "profile.account.username")}>
            {identity.username ? (
              <span dir="ltr" className="font-medium text-primary">@{identity.username}</span>
            ) : (
              <Muted>{t(dict, "profile.account.notSet")}</Muted>
            )}
          </Row>
          <Row label={t(dict, "profile.account.jobTitle")}>
            {identity.jobTitle ?? <Muted>{t(dict, "profile.account.notSet")}</Muted>}
          </Row>
          <Row label={t(dict, "profile.account.country")}>
            {identity.countryCode ? (
              <>
                <span aria-hidden>{identity.countryCode.toUpperCase()}</span>{" "}
                {countryName(identity.countryCode, locale, locale === "ar" ? identity.countryNameAr : identity.countryNameEn) ?? "—"}
              </>
            ) : (
              <Muted>{t(dict, "profile.account.notSet")}</Muted>
            )}
          </Row>
          <Row label={t(dict, "profile.account.created")}>{formatDate(identity.createdAt, locale)}</Row>
          <Row label={t(dict, "profile.account.status")}>
            {identity.banned ? (
              <Badge variant="destructive">{t(dict, "profile.account.banned")}</Badge>
            ) : (
              <Badge variant="success">{t(dict, "profile.account.statusActive")}</Badge>
            )}
          </Row>
        </CardContent>
      </Card>

      {/* Memberships summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(dict, "profile.account.memberships")}</CardTitle>
          <CardDescription>
            {formatNumber(organizations.length, locale)} ·{" "}
            {formatNumber(systems.length, locale)} {t(dict, "profile.systems.title")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {organizations.length === 0 ? (
            <Muted>{t(dict, "profile.orgs.empty")}</Muted>
          ) : (
            <ul className="space-y-1.5">
              {organizations.slice(0, 5).map((org) => (
                <li key={org.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{org.name}</span>
                  <Badge variant={TONE_VARIANT[orgStatus(dict, org.status).tone]} className="shrink-0">
                    {roleLabel(dict, org.role)}
                  </Badge>
                </li>
              ))}
              {organizations.length > 5 ? (
                <li className="text-xs text-muted-foreground">
                  +{formatNumber(organizations.length - 5, locale)}
                </li>
              ) : null}
            </ul>
          )}

          <div className="pt-3">
            <p className="mb-1 text-xs text-muted-foreground">{t(dict, "profile.systems.installed")}</p>
            <Progress
              value={
                organizations.length === 0
                  ? 0
                  : Math.round((systems.length / (organizations.length * 10)) * 100)
              }
              className="h-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground" dir={dir}>
              {t(dict, "profile.systems.progress")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent systems */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">{t(dict, "profile.systems.recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {systems.length === 0 ? (
            <Muted>{t(dict, "profile.systems.empty")}</Muted>
          ) : (
            <SystemGrid systems={systems.slice(0, 6)} dict={dict} locale={locale} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
      <dt className="shrink-0 text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className="min-w-0 text-end text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-normal text-muted-foreground">{children}</span>;
}

/** Shared by the overview and the dedicated systems tab. */
export function SystemGrid({
  systems,
  dict,
  locale,
  onRename,
  renamingId,
  onToggleRename,
  onReClone,
  onActivateAccess,
}: {
  systems: ProfileSystem[];
  dict: Dictionary;
  locale: Locale;
  /** Omitted on the read-only overview panel; present on the systems tab. */
  onRename?: (system: ProfileSystem, nextName: string) => void;
  /** Which card's editor is open, so only one is editable at once. */
  renamingId?: string | null;
  /** Lifts the open-editor state — the grid stays a controlled component. */
  onToggleRename?: (systemId: string | null) => void;
  /** Repair action: re-copy the org's files from the master template. */
  onReClone?: (system: ProfileSystem) => void;
  /** Turn on direct sign-in for one system, by confirming the platform password. */
  onActivateAccess?: (system: ProfileSystem) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {systems.map((system) => {
        const status = systemStatus(dict, system.status);
        // The org's own name wins over the catalog's, in either locale — it is a
        // deliberate label for this install, not a translation of the product.
        const label = system.displayName ?? (locale === "ar" ? system.nameAr || system.name : system.name);
        const Icon = appIcon(system.icon);
        // flex-col + mt-auto is what keeps the grid tidy: the status row is
        // pinned to the bottom of every card, so it lands on one baseline
        // across a row instead of riding up and down with the title length.
        const cardCls =
          "group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40";
        // The card body is never inside the <a>. The link is a sibling overlay
        // covering the whole card, and the content sits above it with pointer
        // events off, so a click on the card navigates while the rename button
        // (pointer events back on) stays clickable. While the editor is open the
        // link is dropped entirely: an anchor wrapping a text input would
        // swallow every keystroke into a navigation.
        const editing = onRename !== undefined && renamingId === system.id;
        const card = (
          <>
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary"
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                <p className="truncate text-xs text-muted-foreground">{system.organizationName}</p>
              </div>
            </div>
            <SystemAccessRow dict={dict} system={system} onActivate={onActivateAccess} />
            <div className="mt-auto flex flex-wrap items-center gap-1.5">
              <Badge variant={TONE_VARIANT[status.tone]}>{status.label}</Badge>
              {system.version ? (
                // A chip rather than loose text, so it reads as a peer of the
                // status badge instead of stray characters next to a pill.
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
                  v{system.version}
                </span>
              ) : null}
              {/* The whole card is already a link through the invisible overlay
                  above, which is why a card can look like a label and a badge and
                  nothing you would think to click. This is the visible half of
                  that same target, and the parent re-enables pointer events on
                  anchors, so it is clickable rather than merely painted. */}
              {system.route && !editing ? (
                <Link
                  href={system.route}
                  title={t(dict, "profile.systems.openHint")}
                  className="ms-auto inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold leading-4 text-white transition-colors hover:bg-primary/90"
                >
                  {t(dict, "profile.systems.open")}
                </Link>
              ) : null}
              {onReClone ? (
                <button
                  type="button"
                  title={t(dict, "profile.systems.reCloneHint")}
                  onClick={() => onReClone(system)}
                  className="rounded-full px-2 py-0.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t(dict, "profile.systems.reClone")}
                </button>
              ) : null}
              {onRename ? (
                <button
                  type="button"
                  onClick={() => onToggleRename?.(editing ? null : system.id)}
                  aria-expanded={editing}
                  // The right-alignment belongs to the LAST control in the row,
                  // so it moves here when there is no route to open and the open
                  // button is not rendering.
                  className={`rounded-full px-2 py-0.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground${system.route && !editing ? "" : " ms-auto"}`}
                >
                  {t(dict, "profile.systems.rename")}
                </button>
              ) : null}
            </div>
            {editing ? (
              <RenameSystemForm
                key={system.id}
                system={system}
                dict={dict}
                onCancel={() => onToggleRename?.(null)}
                onSubmit={(next) => onRename(system, next)}
              />
            ) : null}
          </>
        );
        return (
          <li key={system.id} className="h-full">
            <div className={`${cardCls} relative`}>
              {system.route && !editing ? (
                <Link href={system.route} aria-label={label} className="absolute inset-0 z-0" />
              ) : null}
              <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto [&_a]:pointer-events-auto">
                {card}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * How the reader signs in to this org's copy, and the one action that changes it.
 *
 * Three states, and they are genuinely different rather than three wordings of
 * "off":
 *
 *  - `password` + ready: their platform password works on the system's own login
 *    screen. This is the whole point of the feature, so the username is shown
 *    literally — a member who does not know what to type will not guess it.
 *  - `password` + not ready: stored but not yet delivered. Says so instead of
 *    claiming a working login, because it arrives on the next request.
 *  - `gateway`: either they never confirmed (so there is an action), or they sign
 *    in socially and there is nothing to confirm (so there is not).
 */
function SystemAccessRow({
  dict,
  system,
  onActivate,
}: {
  dict: Dictionary;
  system: ProfileSystem;
  onActivate?: (system: ProfileSystem) => void;
}) {
  const { access } = system;
  const tone =
    access.mode === "password" && access.ready
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-border bg-muted/40 text-muted-foreground";

  return (
    <div className={cn("rounded-lg border px-2.5 py-2", tone)}>
      <p className="text-[11px] font-semibold">{t(dict, "profile.systems.access")}</p>
      {access.mode === "password" ? (
        <>
          <p className="mt-0.5 text-[11px]">
            {access.ready
              ? t(dict, "profile.systems.accessPassword")
              : t(dict, "profile.systems.accessPending")}
          </p>
          {access.username ? (
            <p className="mt-1 truncate font-mono text-[11px] text-foreground" dir="ltr">
              {access.username}
            </p>
          ) : null}
        </>
      ) : access.unavailableReason === "social_login" ? (
        <>
          <p className="mt-0.5 text-[11px]">{t(dict, "profile.systems.accessSocial")}</p>
          <p className="mt-0.5 text-[11px] opacity-80">{t(dict, "profile.systems.accessSocialHint")}</p>
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[11px]">{t(dict, "profile.systems.accessGateway")}</p>
          <p className="mt-0.5 text-[11px] opacity-80">{t(dict, "profile.systems.accessGatewayHint")}</p>
          {onActivate ? (
            <button
              type="button"
              onClick={() => onActivate(system)}
              className="mt-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold leading-4 text-white transition-colors hover:bg-primary/90"
            >
              {t(dict, "profile.systems.accessActivate")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Inline editor for the org's own name of one installed system. */
function RenameSystemForm({
  system,
  dict,
  onSubmit,
  onCancel,
}: {
  system: ProfileSystem;
  dict: Dictionary;
  onSubmit: (nextName: string) => void;
  onCancel: () => void;
}) {
  const fallback = system.nameAr || system.name;
  const [value, setValue] = useState(system.displayName ?? fallback);

  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <label className="block text-[11px] font-medium text-muted-foreground" htmlFor={`rename-${system.id}`}>
        {t(dict, "profile.systems.renameTitle")}
      </label>
      <input
        id={`rename-${system.id}`}
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
      />
      <p className="text-[11px] leading-4 text-muted-foreground">{t(dict, "profile.systems.renameHint")}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="submit" size="sm" className="h-7 px-2 text-xs">
          {t(dict, "profile.systems.renameSave")}
        </Button>
        {system.displayName ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onSubmit("")}
          >
            {t(dict, "profile.systems.renameReset")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancel}>
          {t(dict, "common.cancel")}
        </Button>
      </div>
    </form>
  );
}
