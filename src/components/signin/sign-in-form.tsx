"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/core/auth/client";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import type { TenantByHost } from "@/core/tenancy/host";

const ParticleCanvas = dynamic(() => import("@/components/signin/particle-canvas"), {
  ssr: false,
});

export function SignInForm({
  tenant,
  registered = false,
  system = null,
  socialProviders = ["google", "facebook"],
}: {
  tenant: TenantByHost | null;
  registered?: boolean;
  system?: { id: string; nameAr: string; nameEn: string } | null;
  socialProviders?: string[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [success, setSuccess] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const brandVars: Record<string, string> = {};
  if (tenant?.branding?.primary) {
    brandVars["--primary"] = tenant.branding.primary;
    brandVars["--brand-primary"] = tenant.branding.primary;
  }
  if (tenant?.branding?.accent) brandVars["--brand-accent"] = tenant.branding.accent;
  if (typeof tenant?.branding?.radius === "number") {
    brandVars["--brand-radius"] = `${tenant.branding.radius}px`;
  }

  const displayName = tenant?.name ?? "Business OS";
  const logo = tenant?.logo ?? "/icons/BO.webp";
  const subtitle = tenant ? `سجّل دخولك إلى ${tenant.name}` : "سجّل دخولك إلى لوحة التحكم";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
        rememberMe: remember,
      });
      if (error) {
        setError(error.message ?? "فشل تسجيل الدخول");
        setBusy(false);
        return;
      }
      setSuccess(true);
      // Platform realm admin (user.role === "admin") lands in the console;
      // everyone else goes into their organization.
      const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
      setTimeout(() => {
        if (isAdmin) {
          router.push("/platform-admin");
          router.refresh();
        } else if (tenant) {
          const form = new FormData();
          form.set("organizationId", tenant.organizationId);
          fetch("/api/v1/organizations/activate-form", {
            method: "POST",
            body: form,
          })
            .then((res) => {
              // The server redirects to /{org.slug}/profile; fall back the same
              // way if this fetch ever returns a non-URL body.
              const target = res.url ? new URL(res.url).pathname + new URL(res.url).search : `/${tenant.slug}/profile`;
              router.push(target);
              router.refresh();
            })
            .catch(() => {});
        } else {
          router.push(system ? `/select-org?system=${system.id}` : "/select-org");
          router.refresh();
        }
      }, 1200);
    } catch {
      setError("حدث خطأ غير متوقع");
      setBusy(false);
    }
  }

  return (
    <OnboardingShell>
      <ParticleCanvas />

      {/* Main content */}
      <main className="relative z-10 flex items-center justify-center px-4 py-24" dir="rtl">
        <div
          ref={cardRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="w-full max-w-[420px] transition-transform duration-200 ease-out"
          style={{
            transformStyle: "preserve-3d",
            willChange: "transform",
            ...brandVars,
          }}
        >
          {/* Card glass container */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
            {/* Subtle inner gradient */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />

            {/* Card content */}
            <div className="relative">
              {/* Logo */}
              <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center">
                <div className="relative flex h-full w-full items-center justify-center rounded-2xl overflow-hidden shadow-xl shadow-primary/30 ring-1 ring-white/10 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/40 hover:scale-105">
                  {/* eslint-disable-next-line @next/next/no-img-element -- tenant logo is a remote/uploaded URL of unknown dimensions */}
                  <img src={logo} alt={displayName} className="h-full w-full object-contain" />
                </div>
              </div>

              {/* Header */}
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {displayName}
                </h1>
                <p className="mt-2 text-sm text-white/40">
                  {subtitle}
                </p>
                {tenant && (
                  <p className="mt-1 text-xs text-white/25">{tenant.slug}</p>
                )}
              </div>

              {/* Chosen system (from /systems marketplace) */}
              {system && (
                <Link
                  href="/systems"
                  className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3 backdrop-blur-sm transition-colors hover:border-primary/50"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                    <span className="truncate text-sm text-white/85">
                      النظام المختار: <span className="font-semibold text-primary">{system.nameAr}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-white/40 hover:text-white/70">تغيير</span>
                </Link>
              )}

              {/* Error */}
              {error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400 backdrop-blur-sm">
                  {error}
                </div>
              )}

              {/* Registration confirmation */}
              {registered && !error && (
                <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300 backdrop-blur-sm">
                  تم إنشاء حسابك. سجّل الدخول — سيُفعَّل نظامك بعد موافقة إدارة المنصة على طلبك
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="mb-6 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-center text-sm text-primary backdrop-blur-sm">
                  تم الاتصال بنجاح
                </div>
              )}

              {/* Form */}
              <form onSubmit={onSubmit} className="space-y-5">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-white/50">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-primary/40 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(3,234,188,0.08)] focus:ring-1 focus:ring-primary/20"
                      dir="ltr"
                    />
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-white/50">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 pl-11 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-primary/40 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(3,234,188,0.08)] focus:ring-1 focus:ring-primary/20"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 left-0 flex items-center pl-3 text-white/30 transition-colors hover:text-white/60"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember + Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
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
                    <span className="text-xs text-white/40">تذكر هذه الجلسة</span>
                  </label>
                  <button
                    type="button"
                    className="text-xs text-white/30 transition-colors hover:text-primary/70"
                  >
                    إعادة تعيين الوصول
                  </button>
                </div>

                {/* Main CTA */}
                <button
                  type="submit"
                  disabled={busy || success}
                  className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-l from-[#0263D1] via-primary to-[#03EABC] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {/* Button glow */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-[#0263D1] via-primary to-[#03EABC] opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-50" />

                  <span className="relative flex items-center justify-center gap-2">
                    {busy ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        جاري الاتصال...
                      </>
                    ) : success ? (
                      <>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        تم الاتصال بنجاح
                      </>
                    ) : (
                      <>
                        تسجيل الدخول
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </span>
                </button>
              </form>

              {/* Divider */}
              {socialProviders.length > 0 && (
                <div className="my-7 flex items-center gap-4">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="whitespace-nowrap text-[10px] font-medium tracking-widest text-white/20">
                    أو تابع عبر
                  </span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
              )}

              {/* Social buttons (absolute tenant callbackURL: Google calls back
                  on the root domain, so a relative URL would strand the user
                  there instead of `{slug}.…/select-org`) */}
              {socialProviders.length > 0 && (
                <div className={`grid gap-3 ${socialProviders.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {socialProviders.includes("google") && (
                    <button
                      type="button"
                      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: tenant ? `${window.location.origin}/select-org` : "/auth/complete-org" })}
                      className="group flex items-center justify-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs font-medium text-white/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/80 hover:shadow-lg hover:shadow-black/20"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      جوجل
                    </button>
                  )}
                  {socialProviders.includes("facebook") && (
                    <button
                      type="button"
                      onClick={() => authClient.signIn.social({ provider: "facebook", callbackURL: tenant ? `${window.location.origin}/select-org` : "/auth/complete-org" })}
                      className="group flex items-center justify-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs font-medium text-white/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/80 hover:shadow-lg hover:shadow-black/20"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      فيسبوك
                    </button>
                  )}
                </div>
              )}

              {/* Register link */}
              <p className="mt-7 text-center text-sm text-white/30">
                ليس لديك حساب؟{" "}
                <Link
                  href="/signup"
                  className="font-medium text-primary/80 transition-colors duration-200 hover:text-primary"
                >
                  أنشئ حساباً جديداً
                </Link>
              </p>
            </div>
          </div>

          {/* Card outer glow on hover */}
          <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-primary/[0.03] opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
        </div>
      </main>
    </OnboardingShell>
  );
}