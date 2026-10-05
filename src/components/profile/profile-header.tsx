"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { signOutAndRedirect } from "@/core/auth/client";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import { initialsOf, formatDate, formatNumber } from "@/core/profile/format";
import { countryFlag } from "./labels";
import type { ProfileOverview } from "@/core/profile/types";
import type { MediaKind } from "@/core/profile/media";
import type { ProfileController } from "./use-profile";

/**
 * Cover + avatar + identity block. Owns nothing but the two file inputs; every
 * mutation is delegated to the controller so the header can never hold a value
 * the server has not accepted yet.
 */

const SOCIAL_ORDER = ["website", "github", "linkedin", "twitter", "facebook", "instagram"] as const;

const SOCIAL_ICON: Record<(typeof SOCIAL_ORDER)[number], string> = {
  website: "🌐",
  github: "⌨",
  linkedin: "in",
  twitter: "𝕏",
  facebook: "f",
  instagram: "ig",
};

interface Props {
  dict: Dictionary;
  locale: Locale;
  dir: "rtl" | "ltr";
  overview: ProfileOverview;
  controller: ProfileController;
  onEdit: () => void;
}

export function ProfileHeader({ dict, locale, dir, overview, controller, onEdit }: Props) {
  const { identity } = overview;
  const [hover, setHover] = useState<MediaKind | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const pick = (kind: MediaKind) => (kind === "avatar" ? avatarInput : coverInput).current?.click();

  // `signingOut` guards the double-click: the request has to round-trip before
  // the hard navigation happens, and a second click in that window would fire a
  // second sign-out.
  const startSignOut = async () => {
    setSigningOut(true);
    await signOutAndRedirect();
  };

  return (
    <header
      className="relative"
      onMouseLeave={() => setHover(null)}
    >
      {/* Cover */}
      <div
        className={cn(
          "group relative h-40 overflow-hidden rounded-b-3xl border border-border sm:h-52",
          identity.coverImage ? "bg-muted" : "bg-gradient-to-br from-primary/15 via-muted to-accent/15",
        )}
      >
        {identity.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, same-origin, session-gated endpoint: a plain img avoids an optimizer round trip that would need a loader
          <img
            src={identity.coverImage}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div aria-hidden className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(circle_at_75%_70%,rgba(16,185,129,0.18),transparent_55%)]" />
        )}

        {/* Actions sit on the trailing side: the inline-end, which is the left
            in the Arabic (RTL) UI and the right if the locale is ever mirrored.
            `justify-between` would pin the single group to the inline-start
            instead, i.e. the right. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-end gap-2 p-3 sm:p-4">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => pick("cover")}
              disabled={controller.uploading !== null}
            >
              {controller.uploading === "cover" ? t(dict, "profile.media.uploading") : t(dict, "profile.header.changeCover")}
            </Button>
            {identity.coverImage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void controller.removeMedia("cover")}
                disabled={controller.uploading !== null}
              >
                {t(dict, "profile.media.remove")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Identity row */}
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-3 sm:-mt-16">
          <div className="flex items-end gap-4">
            <button
              type="button"
              className="group/avatar relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onMouseEnter={() => setHover("avatar")}
              onFocus={() => setHover("avatar")}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
              onClick={() => pick("avatar")}
              disabled={controller.uploading !== null}
              aria-label={t(dict, "profile.header.changeAvatar")}
            >
              <div
                className={cn(
                  "flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted text-2xl font-bold text-muted-foreground shadow-lg sm:size-32",
                  controller.uploading === null && "cursor-pointer",
                )}
              >
                {identity.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- see cover note above
                  <img src={identity.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  initialsOf(identity.name)
                )}
              </div>

              {hover === "avatar" || controller.uploading === "avatar" ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/60 text-xs font-semibold text-white">
                  {controller.uploading === "avatar" ? (
                    t(dict, "profile.media.uploading")
                  ) : (
                    <>
                      <span aria-hidden className="text-lg">+</span>
                      <span>{t(dict, "profile.media.replace")}</span>
                    </>
                  )}
                </div>
              ) : null}

              {identity.online ? (
                <span
                  title={t(dict, "profile.account.online")}
                  aria-label={t(dict, "profile.account.online")}
                  className="pointer-events-none absolute bottom-1 end-1 size-4 rounded-full border-2 border-background bg-emerald-500"
                />
              ) : null}
            </button>

            <div className="pb-1">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
                {identity.name}
                {/* The value is Better Auth's admin-plugin role, which is the
                    literal "admin" — the platform gate compares against exactly
                    that in core/platform/gate.ts. It was previously compared
                    against "PLATFORM_ADMIN", which nothing ever writes, so this
                    badge could never have appeared. */}
                {identity.role === "admin" ? (
                  <Badge variant="warning">{t(dict, "profile.account.platformAdmin")}</Badge>
                ) : null}
                {identity.banned ? <Badge variant="destructive">{t(dict, "profile.account.banned")}</Badge> : null}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {identity.username ? (
                  <span className="font-medium text-primary">@{identity.username}</span>
                ) : (
                  <span className="italic">{t(dict, "profile.account.noUsername")}</span>
                )}
                {identity.jobTitle ? <span className="ms-2">· {identity.jobTitle}</span> : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-1">
            {/* Sign-out lives in the header, not only in the security tab, because
                it is the one action on this page you may need from any tab. It
                cannot sit next to a tab switcher that swaps the whole panel
                below it. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => void startSignOut()}
              disabled={signingOut}
            >
              {t(dict, "profile.header.signOut")}
            </Button>
            <Button type="button" onClick={onEdit} disabled={controller.saving}>
              {t(dict, "profile.header.editProfile")}
            </Button>
          </div>
        </div>

        {/* Meta line */}
        <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <dt className="sr-only">{t(dict, "profile.account.identifier")}</dt>
            <dd dir="ltr" className="max-w-[16rem] truncate font-medium text-foreground">
              {identity.displayIdentifier}
            </dd>
            {!identity.isPhoneAccount && identity.emailVerified ? (
              <span title={t(dict, "profile.account.emailVerified")} aria-label={t(dict, "profile.account.emailVerified")}>
                ✓
              </span>
            ) : null}
          </div>

          {identity.countryCode ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">{t(dict, "profile.account.country")}</dt>
              <dd>
                <span aria-hidden>{countryFlag(identity.countryCode)}</span>{" "}
                {locale === "ar" ? identity.countryNameAr : identity.countryNameEn}
              </dd>
            </div>
          ) : null}

          {identity.location || identity.city ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">{t(dict, "profile.account.location")}</dt>
              <dd>{[identity.city, identity.location].filter(Boolean).join("، ")}</dd>
            </div>
          ) : null}

          <div className="flex items-center gap-1">
            <dt className="sr-only">{t(dict, "profile.account.joined")}</dt>
            <dd>
              {t(dict, "profile.account.joined")} {formatDate(identity.createdAt, locale)}
            </dd>
          </div>

          <div className="flex items-center gap-1">
            <dt className="sr-only">{t(dict, "profile.activity.title")}</dt>
            <dd>{formatNumber(overview.stats.find((s) => s.key === "activity")?.value ?? 0, locale)}</dd>
          </div>
        </dl>

        {/* Socials */}
        {SOCIAL_ORDER.some((k) => identity.socials[k]) || identity.socials.links.length > 0 ? (
          <ul className="mt-3 flex flex-wrap items-center gap-2">
            {SOCIAL_ORDER.filter((k) => identity.socials[k]).map((key) => (
              <li key={key}>
                <a
                  href={identity.socials[key] as string}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <span className={key === "website" ? "text-sm" : "text-[10px]"}>{SOCIAL_ICON[key]}</span>
                  <span className="sr-only">{key}</span>
                </a>
              </li>
            ))}
            {identity.socials.links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex h-8 items-center rounded-full border border-border bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                  dir={dir}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {identity.bio ? (
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-foreground/80">{identity.bio}</p>
        ) : null}
      </div>

      {/* Hidden pickers — a native input keeps drag/drop-free mobile pickers working. */}
      <input
        ref={avatarInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void controller.upload("avatar", file);
        }}
      />
      <input
        ref={coverInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void controller.upload("cover", file);
        }}
      />
    </header>
  );
}
