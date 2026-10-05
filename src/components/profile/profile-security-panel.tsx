"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOutAndRedirect } from "@/core/auth/client";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import { describeUserAgent, formatDateTime, formatRelative, isRealIp } from "@/core/profile/format";
import type { ProfileOverview } from "@/core/profile/types";
import type { ProfileController } from "./use-profile";

/**
 * Security tab: password change, an honest 2FA status, and the device list.
 *
 * Revocation is by session *id*; the current session is marked and cannot be
 * revoked from here because ending it is a sign-out, not a revocation.
 */

interface Props {
  dict: Dictionary;
  locale: Locale;
  overview: ProfileOverview;
  controller: ProfileController;
}

export function ProfileSecurityPanel({ dict, locale, overview, controller }: Props) {
  const others = overview.sessions.filter((s) => !s.current);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PasswordCard dict={dict} controller={controller} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(dict, "profile.security.twoFactor")}</CardTitle>
          <CardDescription>{t(dict, "profile.security.twoFactorHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* No 2FA provider is configured, so this is stated rather than faked. */}
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4">
            <span aria-hidden className="text-2xl">🔒</span>
            <div>
              <p className="text-sm font-medium text-foreground">{t(dict, "profile.security.twoFactorUnavailable")}</p>
              <p className="text-xs text-muted-foreground">{t(dict, "profile.security.twoFactorHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{t(dict, "profile.security.sessions")}</CardTitle>
            <CardDescription>{t(dict, "profile.security.sessionsHint")}</CardDescription>
          </div>
          {others.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm(t(dict, "profile.security.revokeAllConfirm"))) {
                  void controller.revokeOtherSessions();
                }
              }}
            >
              {t(dict, "profile.security.revokeAll")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t(dict, "profile.empty.generic")}</p>
          ) : (
            <ul className="space-y-2">
              {overview.sessions.map((session) => {
                const ua = describeUserAgent(session.userAgent);
                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-base">
                        {session.current ? "●" : "○"}
                      </span>
                      <div className="min-w-0">
<div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <span className="truncate">
                            {[ua.browser, ua.os].filter(Boolean).join(" · ") || t(dict, "profile.security.unknownDevice")}
                          </span>
                          {session.current ? (
                            <Badge variant="success">{t(dict, "profile.security.currentSession")}</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {session.ipAddress && isRealIp(session.ipAddress) ? (
                            <span dir="ltr">{session.ipAddress}</span>
                          ) : null}
                          {" · "}
                          {t(dict, "profile.security.lastSeen")} {formatRelative(session.updatedAt, locale)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground/80">
                          {t(dict, "profile.security.createdAt")} {formatDateTime(session.createdAt, locale)} ·{" "}
                          {t(dict, "profile.security.expiresAt")} {formatDateTime(session.expiresAt, locale)}
                        </p>
                      </div>
                    </div>

                    {session.current ? (
                      // A real action, not navigation: the auth client clears the
                      // session cookie and lands on /signin.
                      <Button size="sm" variant="ghost" onClick={() => void signOutAndRedirect()}>
                        {t(dict, "profile.security.signOut")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void controller.revokeSession(session.id)}
                      >
                        {t(dict, "profile.security.revoke")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordCard({
  dict,
  controller,
}: {
  dict: Dictionary;
  controller: ProfileController;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(dict, "profile.security.changePassword")}</CardTitle>
        <CardDescription>{t(dict, "profile.security.passwordHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (next !== confirm) {
              setError(t(dict, "profile.security.mismatch"));
              return;
            }
            void controller.changePassword(current, next).then((res) => {
              if (res.ok) {
                setCurrent("");
                setNext("");
                setConfirm("");
              } else {
                setError(res.error);
              }
            });
          }}
        >
          <Field id="cur-pw" label={t(dict, "profile.security.currentPassword")}>
            <Input
              id="cur-pw"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field id="new-pw" label={t(dict, "profile.security.newPassword")}>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field id="confirm-pw" label={t(dict, "profile.security.confirmPassword")}>
            <Input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={mismatch}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              dir="ltr"
            />
          </Field>

          {mismatch || error ? (
            <p role="alert" className="text-xs text-destructive">
              {error ?? t(dict, "profile.security.mismatch")}
            </p>
          ) : null}

          <Button type="submit" disabled={controller.saving || mismatch || next.length < 8}>
            {controller.saving ? t(dict, "profile.editor.saving") : t(dict, "profile.security.changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
