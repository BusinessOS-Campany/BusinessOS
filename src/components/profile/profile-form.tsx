"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/core/auth/client";

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  bio: string | null;
  phone: string | null;
  locale: "ar" | "en";
  preferences: { emailNotifications?: boolean; marketing?: boolean; aiAssist?: boolean } | null;
};

type ActiveSession = {
  id: string;
  token: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current?: boolean;
};

type Envelope<T> = { data?: T };

const inputCls =
  "w-full rounded-lg border-white/15 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:text-white focus-visible:border-primary transition-colors";

export function ProfileForm() {
  const router = useRouter();

  const [user, setUser] = React.useState<ProfileUser | null>(null);
  const [sessions, setSessions] = React.useState<ActiveSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // PATCH fields (dirty-tracked)
  const [name, setName] = React.useState("");
  const [image, setImage] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [locale, setLocale] = React.useState<"ar" | "en">("ar");
  const [prefs, setPrefs] = React.useState({ emailNotifications: false, marketing: false, aiAssist: false });

  // password
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  // avatar upload
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await fetch("/api/v1/profile", { cache: "no-store" });
        if (!first.ok) throw new Error(String(first.status));
        const env = (await first.json()) as Envelope<{ user: ProfileUser; sessions: ActiveSession[] }>;
        const d = env.data;
        if (!d || cancelled) return;
        setUser(d.user);
        setName(d.user.name);
        setImage(d.user.image ?? "");
        setBio(d.user.bio ?? "");
        setPhone(d.user.phone ?? "");
        setLocale(d.user.locale);
        setPrefs({
          emailNotifications: d.user.preferences?.emailNotifications ?? false,
          marketing: d.user.preferences?.marketing ?? false,
          aiAssist: d.user.preferences?.aiAssist ?? false,
        });
        setSessions(d.sessions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const resp = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          image: image.trim() || null,
          bio: bio.trim() || null,
          phone: phone.trim() || null,
          locale,
          preferences: prefs,
        }),
      });
      const env = (await resp.json()) as Envelope<{ user: ProfileUser }>;
      if (!resp.ok) throw new Error(String(resp.status));
      if (env.data) setUser(env.data.user);
      setNotice({ ok: true, text: "تم الحفظ" });
      router.refresh();
    } catch {
      setNotice({ ok: false, text: "تعذّر الحفظ" });
    } finally {
      setBusy(false);
    }
  };

  const chooseAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const maxBytes = 5 * 1024 * 1024;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > maxBytes) {
      setNotice({ ok: false, text: "يُقبل JPG/PNG/WebP/GIF حتى 5 ميجا" });
      return;
    }
    setUploadingAvatar(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/v1/profile/avatar", { method: "POST", body: fd });
      const env = (await resp.json()) as Envelope<{ url: string }>;
      if (!resp.ok || !env.data?.url) throw new Error(String(resp.status));
      setImage(env.data.url);
      setNotice({ ok: true, text: "تم رفع الصورة — احفظ للتأكيد" });
    } catch {
      setNotice({ ok: false, text: "تعذّر رفع الصورة" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const clearAvatar = () => {
    setImage("");
    setNotice({ ok: true, text: "ستتم إزالة الصورة عند الحفظ" });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const { error: pErr } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (pErr) throw new Error(String(pErr.message ?? pErr));
      setCurrentPassword("");
      setNewPassword("");
      setNotice({ ok: true, text: "تم تغيير كلمة المرور" });
    } catch {
      setNotice({ ok: false, text: "كلمة المرور الحالية غير صحيحة" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token?: string, all?: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      if (token) await authClient.revokeSession({ token });
      else if (all) await authClient.revokeOtherSessions();
      router.refresh();
    } catch {
      setNotice({ ok: false, text: "تعذّر إنهاء الجلسة" });
    } finally {
      setBusy(false);
    }
  };

  const label = "mb-1.5 block text-sm font-medium text-foreground/80";

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-center">
        <p className="font-medium text-red-100">تعذّر تحميل الملف الشخصي</p>
        <p className="mt-2 text-sm text-red-200/80">
          {error ?? "يرجى تسجيل الدخول أولًا."} —{" "}
          <button className="underline underline-offset-4" onClick={() => router.push("/signin")}>
            تسجيل الدخول
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {notice && (
        <div
          className={
            notice.ok
              ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
              : "rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          }
        >
          {notice.text}
        </div>
      )}

      <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>البيانات الشخصية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            {/* avatar preview */}
            <div className="relative">
              {image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={user.name}
                    src={image}
                    className="h-16 w-16 rounded-full border border-white/10 object-cover"
                  />
                </>
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 items-center justify-center rounded-full object-cover text-xl font-bold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg,#0263D1 0%,#0256AF 100%)",
                  }}
                  dir="ltr"
                >
                  {String((name || user.name).trim().charAt(0) || "؟").toUpperCase()}
                </div>
              )}
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-xs text-white">
                  …
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={chooseAvatar}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                {uploadingAvatar ? "جارٍ الرفع…" : "اختيار من الجهاز"}
              </Button>
              {image && (
                <Button type="button" variant="ghost" size="sm" onClick={clearAvatar}>
                  إزالة الصورة
                </Button>
              )}
            </div>

            {user.emailVerified ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                بريد مؤكّد
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                بريد غير مؤكّد
              </span>
            )}
          </div>

          <form onSubmit={save} className="space-y-3">
            <label>
              <span className={label}>الاسم</span>
              <Input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span className={label}>الوصف</span>
              <Textarea className={inputCls} rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
            </label>
            <label>
              <span className={label}>الهاتف</span>
              <Input className={inputCls} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              <span className={label}>اللغة</span>
              <select
                className={inputCls}
                value={locale}
                onChange={(e) => setLocale(e.target.value as "ar" | "en")}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <div className="space-y-2 pt-2">
              {(
                [
                  ["الرسائل الفورية", "emailNotifications", prefs.emailNotifications],
                  ["التسويق", "marketing", prefs.marketing],
                  ["مفتاح AI", "aiAssist", prefs.aiAssist],
                ] as const
              ).map(([t, key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{t}</span>
                  <Switch
                    checked={value}
                    onCheckedChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
                  />
                </div>
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "حفظ"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>تغيير كلمة المرور</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <Input type="password" placeholder="كلمة المرور الحالية" dir="ltr" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <Input type="password" placeholder="كلمة المرور الجديدة" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? "…" : "تغيير"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>الجلسات النشطة</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد جلسات أخرى</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {s.current ? "الجلسة الحالية" : "جلسة"}
                      {" · "}
                      {s.ipAddress ?? "بدون IP"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground" dir="ltr">
                      {s.userAgent ?? "بدون وكيل"}
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(s.token)}>
                      إنهاء
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between border-t border-white/10 pt-4 text-sm text-white/60">
        <span>{user.email}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm("هل تريد تسجيل الخروج؟")) {
              fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }).then(() => router.push("/signin"));
            }
          }}
        >
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
