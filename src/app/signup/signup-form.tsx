"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { authClient } from "@/core/auth/client";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { TEMPLATE_LIST } from "@/core/platform/templates/grocery";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import IdentifierField, { type IdentifierMode } from "@/components/onboarding/identifier-field";
import { DEFAULT_COUNTRY } from "@/core/auth/identifier";

const ParticleCanvas = dynamic(() => import("@/components/signin/particle-canvas"), {
  ssr: false,
});

const ICONS: Record<string, string> = {
  "shopping-cart": "🛒",
  "graduation-cap": "🎓",
  "utensils": "🍽️",
  "heart-pulse": "💊",
  "store": "🏪",
};

export type SocialProvider = "google" | "facebook";

export default function SignupForm({
  template: preselected = "",
  socialProviders = [],
}: {
  template?: string;
  socialProviders?: SocialProvider[];
}) {
  const router = useRouter();

  const [form, setForm] = useState({ name: "", password: "", organizationName: "" });
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>("email");
  const [identifier, setIdentifier] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(1000px) rotateY(${x * 3}deg) rotateX(${-y * 3}deg) translateZ(10px)`;
    });
  }, []);

  const onMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    cancelAnimationFrame(rafRef.current);
    card.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg) translateZ(0px)";
  }, []);

  const selected = TEMPLATE_LIST.find((t) => t.code === preselected);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) { setError("يرجى الموافقة على شروط الخدمة"); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/public/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          identifier,
          // Only sent for a phone registration; the server classifies the
          // identifier the same way, so the mode is a UI hint, not authority.
          countryCode: identifierMode === "phone" ? countryCode : null,
          templateCode: preselected || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.messageAr ?? json.error?.messageEn ?? json.error?.message ?? `فشل التسجيل (${res.status})`);
        setBusy(false);
        return;
      }
      router.push("/signin?registered=1");
    } catch {
      setError("خطأ في الاتصال بالشبكة");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-primary/40 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] focus:ring-1 focus:ring-primary/20";
  const labelCls = "mb-1.5 block text-xs font-medium text-white/50";

  return (
    <OnboardingShell>
      <ParticleCanvas />

      {/* Main content */}
      <main className="relative z-10 flex items-center justify-center px-4 py-24" dir="rtl">
        <div
          ref={cardRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="w-full max-w-[440px] transition-transform duration-200 ease-out"
          style={{
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {/* Card glass container */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9">
            {/* Subtle inner gradient */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />

            {/* Card content */}
            <div className="relative">
              {/* Selected system indicator */}
              {selected && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2.5">
                  <span className="text-xl">{ICONS[selected.icon] ?? "📦"}</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-white/70">{selected.nameAr}</p>
                    <p className="text-[10px] text-white/40">{selected.nameEn}</p>
                  </div>
                  <Link href="/systems" className="text-[11px] text-primary/80 transition-colors hover:text-primary">
                    تغيير
                  </Link>
                </div>
              )}

              {/* Logo */}
              <div className="relative mx-auto mb-7 flex h-16 w-16 items-center justify-center">
                <div className="relative flex h-full w-full items-center justify-center rounded-2xl overflow-hidden shadow-xl shadow-primary/30 ring-1 ring-white/10 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/40 hover:scale-105">
                  <Image
                    src="/icons/BO.webp"
                    alt="Business OS"
                    width={64}
                    height={64}
                    className="h-full w-full object-contain"
                    priority
                  />
                </div>
              </div>

              {/* Header */}
              <div className="mb-7 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  إنشاء حساب جديد
                </h1>
                <p className="mt-2 text-sm text-white/40">
                  انضم إلى Business OS مجاناً
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400 backdrop-blur-sm">
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={onSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="name" className={labelCls}>الاسم</label>
                  <input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="أحمد"
                    className={inputCls}
                    dir="rtl"
                  />
                </div>

                {/* Email or phone, with country dial code */}
                <IdentifierField
                  mode={identifierMode}
                  onModeChange={setIdentifierMode}
                  identifier={identifier}
                  onIdentifierChange={setIdentifier}
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  idPrefix="signup"
                  inputCls={inputCls}
                  labelCls={labelCls}
                  autoComplete="email"
                />

                {/* Password */}
                <div>
                  <label htmlFor="password" className={labelCls}>كلمة المرور</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="8 أحرف على الأقل"
                      className={`${inputCls} pl-11`}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 left-0 flex items-center pl-3 text-white/30 transition-colors hover:text-white/60"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Organization name */}
                <div>
                  <label htmlFor="orgName" className={labelCls}>اسم النشاط التجاري / المؤسسة</label>
                  <input
                    id="orgName"
                    required
                    value={form.organizationName}
                    onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                    placeholder="متجري"
                    className={inputCls}
                    dir="rtl"
                  />
                </div>

                {/* Terms agreement */}
                <label className="flex cursor-pointer items-start gap-2.5 pt-1">
                  <div className="relative mt-0.5">
                    <input
                      id="terms"
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-4 w-4 rounded border border-white/15 bg-white/[0.04] transition-all duration-200 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#050510]">
                      <svg
                        className="h-full w-full scale-0 text-white transition-transform duration-150 peer-checked:scale-100"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-xs leading-relaxed text-white/40">
                    أوافق على شروط الخدمة وسياسة الخصوصية
                  </span>
                </label>

                {/* Main CTA */}
                <button
                  type="submit"
                  disabled={busy}
                  className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-l from-primary via-emerald-500 to-emerald-400 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-primary via-emerald-500 to-emerald-400 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-50" />
                  <span className="relative flex items-center justify-center gap-2">
                    {busy ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        جارٍ الإنشاء...
                      </>
                    ) : (
                      <>
                        إنشاء الحساب والبدء
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </span>
                </button>
              </form>

              {/* Divider + social buttons.
                  Only rendered for providers that actually have credentials, so a
                  button on the page is always a button that works. */}
              {socialProviders.length > 0 && (
                <>
                  <div className="my-6 flex items-center gap-4">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="whitespace-nowrap text-[10px] font-medium tracking-widest text-white/20">
                      أو تابع عبر
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>

                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${socialProviders.length}, minmax(0, 1fr))` }}
                  >
                    {socialProviders.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() =>
                          authClient.signIn.social({
                            provider,
                            callbackURL: `/auth/complete-org?template=${encodeURIComponent(preselected)}`,
                          })
                        }
                        className="group flex items-center justify-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs font-medium text-white/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/80 hover:shadow-lg hover:shadow-black/20"
                      >
                        {provider === "google" ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                        )}
                        {provider === "google" ? "جوجل" : "فيسبوك"}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Signin link */}
              <p className="mt-6 text-center text-sm text-white/30">
                لديك حساب بالفعل؟{" "}
                <Link
                  href="/signin"
                  className="font-medium text-primary/80 transition-colors duration-200 hover:text-primary"
                >
                  تسجيل الدخول
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </OnboardingShell>
  );
}
