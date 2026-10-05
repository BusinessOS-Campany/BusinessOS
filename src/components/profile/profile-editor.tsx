"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import {
  LIMITS, normalizeUrl, normalizeUsername, SOCIAL_KEYS, splitName, type SocialKey,
} from "@/core/profile/normalize";
import { MEDIA_RECOMMENDED, MEDIA_MAX_BYTES } from "@/core/profile/media";
import { formatBytes } from "@/core/profile/format";
import type { ProfileOverview } from "@/core/profile/types";
import type { ProfileController } from "./use-profile";

/**
 * Profile editor.
 *
 * All validation here is the *same* helpers the PATCH route runs, so the
 * inline messages match what the server will actually accept. The client copy
 * is not the authority — it exists to avoid a round trip, not to decide.
 */

type UsernameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "invalid"; reason: string }
  | { kind: "taken" };

interface Props {
  dict: Dictionary;
  locale: Locale;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  overview: ProfileOverview;
  controller: ProfileController;
}

interface FormState {
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
  jobTitle: string;
  location: string;
  city: string;
  socials: Record<string, string>;
  links: { id: string; label: string; url: string }[];
  emailNotifications: boolean;
  marketing: boolean;
  aiAssist: boolean;
  locale: Locale;
}

function initialState(overview: ProfileOverview, locale: Locale): FormState {
  const { firstName, lastName } = splitName(overview.identity.name);
  return {
    firstName,
    lastName,
    username: overview.identity.username ?? "",
    bio: overview.identity.bio ?? "",
    jobTitle: overview.identity.extras.jobTitle ?? "",
    location: overview.identity.extras.location ?? "",
    city: overview.identity.extras.city ?? "",
    socials: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, overview.identity.socials[k] ?? ""])),
    links: overview.identity.socials.links.map((l) => ({ ...l })),
    emailNotifications: overview.identity.preferences.emailNotifications,
    marketing: overview.identity.preferences.marketing,
    aiAssist: overview.identity.preferences.aiAssist,
    // The stored preference wins; the current UI locale is only a fallback for
    // accounts that have never chosen one.
    locale: overview.identity.locale === "en" || overview.identity.locale === "ar" ? overview.identity.locale : locale,
  };
}

export function ProfileEditor({ dict, locale, open, onOpenChange, overview, controller }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(overview, locale));
  const [probeResult, setProbeResult] = useState<{ value: string; state: UsernameState } | null>(null);
  // True once a close with unsaved edits has been intercepted.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Stable identity across renders; the whole `controller` object is not.
  const { checkUsername } = controller;

  /**
   * Everything the editor can decide without the server is derived during
   * render. Only the availability probe needs an effect, and its setState all
   * happens inside the debounce callback rather than in the effect body.
   */
  const probe = useMemo(() => {
    const value = form.username.trim();
    if (value === "") return { needed: false as const, invalid: false };
    const parsed = normalizeUsername(value);
    if (!parsed.ok) return { needed: false as const, invalid: true };
    if (parsed.value === overview.identity.username) return { needed: false as const, invalid: false };
    return { needed: true as const, invalid: false, value: parsed.value };
  }, [form.username, overview.identity.username]);

  useEffect(() => {
    // Nothing to probe. Any previous result is already ignored, because
    // `username` only reads `probeResult` when its value matches the current
    // probe, so there is no need to clear it here.
    if (!probe.needed) return;

    const value = probe.value;
    const timer = setTimeout(() => {
      void checkUsername(value).then((res) => {
        setProbeResult({
          value,
          state: res.reason === "taken" ? { kind: "taken" } : res.available ? { kind: "ok" } : { kind: "idle" },
        });
      });
    }, 400);
    return () => clearTimeout(timer);
    // `checkUsername` is a stable useCallback. Depending on the whole
    // `controller` object instead would re-arm this effect on every render
    // (the hook returns a fresh object literal), so each result would trigger
    // another probe and hammer the rate-limited endpoint forever.
  }, [probe, checkUsername]);

  const username: UsernameState = !probe.needed
    ? probe.invalid
      ? { kind: "invalid", reason: "invalid" }
      : { kind: "idle" }
    : probeResult?.value === probe.value
      ? probeResult.state
      : { kind: "checking" };

  const handleOpenChange = (next: boolean) => {
    // Reset on open from the event, so a cancelled edit never leaks forward and
    // no effect is needed to keep the form in sync with the server snapshot.
    if (next) {
      setForm(initialState(overview, locale));
      setProbeResult(null);
      setConfirmDiscard(false);
    }
    onOpenChange(next);
  };
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * Dirty = the form differs from the snapshot it was opened with.
   *
   * Compared as a serialised pair rather than field by field, because the form
   * holds a nested `links` array that would otherwise need its own equality and
   * would still miss any field added later. Two serialisations of the same shape
   * always produce the same string, so this cannot produce a false positive.
   */
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialState(overview, locale)),
    [form, overview, locale],
  );

  /**
   * Closing with unsaved edits asks first. Radix closes on Escape, on the
   * backdrop and on the close button, so the guard has to live in the change
   * handler rather than only on the Cancel button — otherwise the cheapest way
   * to lose an edit is the most natural one.
   */
  const requestClose = () => {
    if (dirty && !controller.saving) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };
  const closeFromDialog = (next: boolean) => {
    if (!next) {
      requestClose();
      return;
    }
    handleOpenChange(true);
  };

  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const nameTooLong = fullName.length > LIMITS.name;
  const bioTooLong = form.bio.length > LIMITS.bio;
  const usernameParsed = useMemo(() => normalizeUsername(form.username.trim()), [form.username]);
  const usernameTooLong = form.username.trim().length > LIMITS.usernameMax;

  const socialErrors = useMemo(
    () =>
      Object.fromEntries(
        SOCIAL_KEYS.filter((k) => form.socials[k] && normalizeUrl(form.socials[k]) === null).map((k) => [
          k,
          t(dict, "profile.socials.invalidUrl"),
        ]),
      ) as Partial<Record<SocialKey, string>>,
    [form.socials, dict],
  );

  const blocked =
    nameTooLong ||
    bioTooLong ||
    usernameTooLong ||
    fullName === "" ||
    Object.keys(socialErrors).length > 0 ||
    username.kind === "taken";

  const submit = async () => {
    const socials: Record<string, string | null> = {};
    for (const key of SOCIAL_KEYS) {
      const raw = form.socials[key].trim();
      socials[key] = raw ? (normalizeUrl(raw) as string) : null;
    }

    const ok = await controller.patch({
      name: fullName,
      username: usernameParsed.ok ? usernameParsed.value : null,
      bio: form.bio.trim() || null,
      socials: {
        ...socials,
        links: form.links
          .filter((l) => l.label.trim() && l.url.trim())
          .map((l) => ({ id: l.id, label: l.label.trim(), url: normalizeUrl(l.url) as string })),
      },
      extras: { jobTitle: form.jobTitle, location: form.location, city: form.city },
      preferences: {
        emailNotifications: form.emailNotifications,
        marketing: form.marketing,
        aiAssist: form.aiAssist,
      },
      locale: form.locale,
    });

    // Bypasses the dirty guard: the edit is saved, not discarded, so asking
    // "discard your changes?" here would be a lie.
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={closeFromDialog}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(e) => {
          if (controller.saving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(dict, "profile.editor.title")}</DialogTitle>
          <DialogDescription>{t(dict, "profile.editor.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Personal */}
          <Section title={t(dict, "profile.editor.sectionPersonal")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="pe-first" label={t(dict, "profile.account.firstName")}>
                <Input
                  id="pe-first"
                  value={form.firstName}
                  maxLength={LIMITS.name}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field id="pe-last" label={t(dict, "profile.account.lastName")}>
                <Input
                  id="pe-last"
                  value={form.lastName}
                  maxLength={LIMITS.name}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
            </div>
            {nameTooLong ? <Error>{t(dict, "profile.error.generic")}</Error> : null}

            <Field
              id="pe-username"
              label={t(dict, "profile.account.username")}
              hint={t(dict, "profile.identity.usernameHint")}
              error={
                username.kind === "taken"
                  ? t(dict, "profile.identity.usernameTaken")
                  : username.kind === "invalid"
                    ? t(dict, "profile.identity.usernameInvalid")
                    : null
              }
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  id="pe-username"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  dir="ltr"
                  maxLength={LIMITS.usernameMax + 1}
                  className="ps-7"
                  aria-invalid={username.kind === "taken" || username.kind === "invalid" || usernameTooLong}
                />
              </div>
            </Field>
            {username.kind === "ok" ? <p className="text-xs text-emerald-600">{t(dict, "profile.identity.usernameAvailable")}</p> : null}
          </Section>

          {/* About */}
          <Section title={t(dict, "profile.editor.about")}>
            <Field
              id="pe-bio"
              label={t(dict, "profile.account.bio")}
              hint={`${form.bio.length}/${LIMITS.bio}`}
              error={bioTooLong ? t(dict, "profile.error.generic") : null}
            >
              <Textarea
                id="pe-bio"
                rows={4}
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="pe-job" label={t(dict, "profile.account.jobTitle")}>
                <Input
                  id="pe-job"
                  value={form.jobTitle}
                  maxLength={LIMITS.jobTitle}
                  onChange={(e) => set("jobTitle", e.target.value)}
                />
              </Field>
              <Field id="pe-city" label={t(dict, "profile.account.city")}>
                <Input id="pe-city" value={form.city} maxLength={LIMITS.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field id="pe-loc" label={t(dict, "profile.account.location")}>
                <Input
                  id="pe-loc"
                  value={form.location}
                  maxLength={LIMITS.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Links */}
          <Section title={t(dict, "profile.editor.sectionLinks")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_KEYS.map((key) => (
                <Field key={key} id={`pe-${key}`} label={t(dict, `profile.socials.${key}`)} error={socialErrors[key]}>
                  <Input
                    id={`pe-${key}`}
                    value={form.socials[key]}
                    placeholder="https://"
                    onChange={(e) => set("socials", { ...form.socials, [key]: e.target.value })}
                    dir="ltr"
                    aria-invalid={Boolean(socialErrors[key])}
                  />
                </Field>
              ))}
            </div>

            <div className="space-y-2">
              {form.links.map((link, i) => (
                <div key={link.id} className="flex gap-2">
                  <Input
                    value={link.label}
                    placeholder={t(dict, "profile.socials.other")}
                    maxLength={LIMITS.linkLabel}
                    aria-label={t(dict, "profile.socials.other")}
                    onChange={(e) => {
                      const next = [...form.links];
                      next[i] = { ...link, label: e.target.value };
                      set("links", next);
                    }}
                    className="w-1/3"
                  />
                  <Input
                    value={link.url}
                    placeholder="https://"
                    dir="ltr"
                    aria-label={t(dict, "profile.socials.website")}
                    onChange={(e) => {
                      const next = [...form.links];
                      next[i] = { ...link, url: e.target.value };
                      set("links", next);
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t(dict, "common.delete")}
                    onClick={() => set("links", form.links.filter((l) => l.id !== link.id))}
                  >
                    ×
                  </Button>
                </div>
              ))}
              {form.links.length < LIMITS.socialLinks ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set("links", [
                      ...form.links,
                      { id: `l${Date.now().toString(36)}`, label: "", url: "" },
                    ])
                  }
                >
                  {t(dict, "profile.identity.addLink")}
                </Button>
              ) : null}
            </div>
          </Section>

          {/* Media hint */}
          <Section title={t(dict, "profile.media.avatarTitle")}>
            <p className="text-xs text-muted-foreground">
              {t(dict, "profile.media.hint")
                .replace("{size}", formatBytes(MEDIA_MAX_BYTES.avatar, locale))
                .replace("{w}", String(MEDIA_RECOMMENDED.avatar.w))
                .replace("{h}", String(MEDIA_RECOMMENDED.avatar.h))}
            </p>
          </Section>

          {/* Preferences */}
          <Section title={t(dict, "profile.account.preferences")}>
            <Field id="pe-locale" label={t(dict, "profile.account.locale")}>
              <div className="flex gap-4">
                {(["ar", "en"] as const).map((code) => (
                  <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.locale === code}
                      onCheckedChange={() => set("locale", code)}
                      aria-label={code === "ar" ? "العربية" : "English"}
                    />
                    {code === "ar" ? "العربية" : "English"}
                  </label>
                ))}
              </div>
            </Field>

            <Toggle
              id="pe-email"
              label={t(dict, "profile.account.emailNotifications")}
              checked={form.emailNotifications}
              onChange={(v) => set("emailNotifications", v)}
            />
            <Toggle
              id="pe-marketing"
              label={t(dict, "profile.account.marketing")}
              checked={form.marketing}
              onChange={(v) => set("marketing", v)}
            />
            <Toggle
              id="pe-ai"
              label={t(dict, "profile.account.aiAssist")}
              checked={form.aiAssist}
              onChange={(v) => set("aiAssist", v)}
            />
          </Section>

          {controller.saveError ? <Error>{controller.saveError}</Error> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={controller.saving}>
            {t(dict, "profile.editor.cancel")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={blocked || controller.saving}>
            {controller.saving ? t(dict, "profile.editor.saving") : t(dict, "profile.editor.save")}
          </Button>
        </DialogFooter>

        {/* Nested inside the editor's own dialog so Radix stacks it, and so the
            editor stays mounted behind it — cancelling the prompt has to leave
            the edits exactly where they were. */}
        <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t(dict, "profile.editor.discardTitle")}</DialogTitle>
              <DialogDescription>{t(dict, "profile.editor.discardBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDiscard(false)}>
                {t(dict, "profile.editor.keepEditing")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmDiscard(false);
                  onOpenChange(false);
                }}
              >
                {t(dict, "profile.editor.confirmDiscard")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Error({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {children}
    </p>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="text-sm font-normal text-foreground">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
