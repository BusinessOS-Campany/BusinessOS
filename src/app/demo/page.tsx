"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useSyncExternalStore, useState } from "react";
import {
  Store,
  ShoppingCart,
  Stethoscope,
  Coffee,
  Monitor,
  Clock3,
  ExternalLink,
  Package,
  TrendingUp,
  Wallet,
  Users,
  CalendarDays,
  Receipt,
  ArrowLeft,
  Timer,
  Database,
  KeyRound,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Lock,
  Bed,
  SmilePlus,
  Pill,
  Microscope,
  Eye,
} from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { BusinessSystemsSection } from "@/components/demo/business-systems-section";
import ScrollReveal from "@/components/landing/scroll-reveal";

/** Green particle wallpaper — same canvas the signin/signup pages use. */
const ParticleCanvas = dynamic(() => import("@/components/signin/particle-canvas"), {
  ssr: false,
});

/**
 * Wallpaper settings for this page. The signin/signup defaults (150 particles,
 * intensity 1) are tuned for a short auth screen; /demo is a long scroll with
 * dense content, so it runs lighter. The connection-line pass is O(n²) per
 * frame; the frame-rate cost of this configuration is measured in
 * PROJECT_MAP.md.
 */
const PARTICLE_COUNT = 90;
const PARTICLE_INTENSITY = 1.9;
import { BUSINESS_SYSTEMS, SYSTEM_CATEGORIES } from "@/core/demo/business-systems-data";
import { liveHref } from "@/core/demo/systems-catalog";
import {
  DEMO_DURATION_MS,
  readDemoTrial,
  subscribeDemoTrial,
  isDemoExpired,
  type DemoTrial,
} from "@/core/demo/trial";

type SystemKey = "grocery" | "clinic" | "cafe" | "hospital" | "dental" | "pharmacy" | "laboratory" | "optometry" | "pos";

interface SystemDef {
  key: SystemKey;
  icon: typeof Store;
  name: string;
  tagline: string;
  stats: { icon: typeof Store; label: string; value: string }[];
  tableTitle: string;
  rows: string[][];
}

const SYSTEMS: SystemDef[] = [
  {
    key: "grocery",
    icon: ShoppingCart,
    name: "نظام بقاله",
    tagline: "منتجات وباركود وموردين وعملاء وتقارير ربح لبقالتك.",
    stats: [
      { icon: Wallet, label: "فواتير اليوم", value: "48" },
      { icon: TrendingUp, label: "الربح اليوم", value: "3,240 ر.س" },
      { icon: Package, label: "المنتجات", value: "2,980" },
      { icon: Users, label: "الموردون", value: "32" },
    ],
    tableTitle: "أحدث الفواتير",
    rows: [
      ["INV-2041", "محمد العلي", "اليوم", "540 ر.س"],
      ["INV-2040", "سوبر ماركت النور", "اليوم", "1,120 ر.س"],
      ["INV-2039", "مطعم الشرق", "أمس", "860 ر.س"],
      ["INV-2038", "سارة أحمد", "أمس", "230 ر.س"],
    ],
  },
{
    key: "clinic",
    icon: Stethoscope,
    name: "نظام علاج طبيعي",
    tagline: "إدارة المرضى والجلسات والمواعيد والمدفوعات لمركزك الصحي.",
    stats: [
      { icon: Users, label: "المرضى", value: "520" },
      { icon: CalendarDays, label: "جلسات اليوم", value: "34" },
      { icon: Receipt, label: "المواعيد", value: "41" },
      { icon: Wallet, label: "الإيرادات هذا الشهر", value: "64,000 ر.س" },
    ],
    tableTitle: "مواعيد اليوم",
    rows: [
      ["أحمد حسن", "جلسة علاج طبيعي", "09:00", "مؤكد"],
      ["فاطمة سعيد", "فحص طبي", "10:30", "مؤكد"],
      ["خالد عمر", "متابعة", "12:00", "منتظر"],
      ["نورة يوسف", "جلسة أولى", "14:00", "مؤكد"],
    ],
  },
  {
    key: "cafe",
    icon: Coffee,
    name: "نظام اداره المقاهي",
    tagline: "إدارة المقهى الإلكتروني — أجهزة وجلسات وشحن ورواتب وتقارير يومية.",
    stats: [
      { icon: Monitor, label: "الأجهزة", value: "24" },
      { icon: Clock3, label: "جلسات اليوم", value: "87" },
      { icon: Wallet, label: "إيرادات اليوم", value: "2,340 ر.س" },
      { icon: Users, label: "الموظفون", value: "9" },
    ],
    tableTitle: "أحدث الجلسات",
    rows: [
      ["PC-03", "جلسة إنترنت", "اليوم", "15 ر.س"],
      ["PC-07", "ساعة ألعاب", "اليوم", "20 ر.س"],
      ["PC-01", "جلسة دراسة", "أمس", "12 ر.س"],
      ["PC-09", "طباعة + جلسة", "أمس", "25 ر.س"],
    ],
  },
  {
    key: "hospital",
    icon: Bed,
    name: "نظام المستشفى",
    tagline: "إدارة المرضى والمواعيد والأسرّة والفواتير والأقسام الطبية.",
    stats: [
      { icon: Users, label: "المرضى", value: "1,240" },
      { icon: CalendarDays, label: "المواعيد اليوم", value: "56" },
      { icon: Bed, label: "الأسرّة المشغولة", value: "87/120" },
      { icon: Wallet, label: "إيرادات الشهر", value: "186,000 ر.س" },
    ],
    tableTitle: "أحدث الحالات",
    rows: [
      ["P-4821", "محمد عبدالله", "الطب الباطني", "650 ر.س"],
      ["P-4820", "سارة أحمد", "الجراحة العامة", "2,100 ر.س"],
      ["P-4819", "علي حسن", "طب الأطفال", "320 ر.س"],
      ["P-4818", "فاطمة محمد", "النسائية", "480 ر.س"],
    ],
  },
  {
    key: "dental",
    icon: SmilePlus,
    name: "نظام عيادة اسنان",
    tagline: "إدارة المرضى والمواعيد والحشوات والتركيبات والفواتير والمختبر لعيادتك.",
    stats: [
      { icon: Users, label: "المرضى", value: "15" },
      { icon: CalendarDays, label: "مواعيد اليوم", value: "8" },
      { icon: Receipt, label: "فواتير اليوم", value: "10" },
      { icon: Wallet, label: "إيرادات الشهر", value: "318,500 ر.س" },
    ],
    tableTitle: "مواعيد اليوم",
    rows: [
      ["P-0001", "محمد العامري", "علاج جذر (36)", "09:00"],
      ["P-0002", "فاطمة القرشي", "استشارة", "09:30"],
      ["P-0003", "عبدالله باذيب", "خلع ضرس", "11:00"],
      ["P-0007", "يوسف الحداد", "متابعة طفل", "13:00"],
    ],
  },
  {
    key: "pharmacy",
    icon: Pill,
    name: "نظام صيدلية",
    tagline: "إدارة الأدوية والمخزون والمنتجات والوصفات الطبية والفواتير لصيدليتك.",
    stats: [
      { icon: Package, label: "المنتجات", value: "1,850" },
      { icon: TrendingUp, label: "مبيعات اليوم", value: "2,640 ر.س" },
      { icon: Users, label: "العملاء", value: "310" },
      { icon: Receipt, label: "فواتير اليوم", value: "22" },
    ],
    tableTitle: "أحدث الفواتير",
    rows: [
      ["RX-1042", "أحمد المقطري", "باراسيتامول 500مغ", "18 ر.س"],
      ["RX-1041", "سارة حسن", "أموكسيسيلين", "24 ر.س"],
      ["RX-1040", "خالد ناصر", "فيتامين D", "42 ر.س"],
      ["RX-1039", "نورة عبدالله", "مضاد حيوي", "31 ر.س"],
    ],
  },
  {
    key: "laboratory",
    icon: Microscope,
    name: "نظام المختبر",
    tagline: "إدارة الفحوصات والعينات والنتائج والأقسام والفواتير لمختبرك الطبي.",
    stats: [
      { icon: Users, label: "المرضى", value: "3" },
      { icon: Microscope, label: "الفحوصات", value: "12" },
      { icon: Receipt, label: "أوامر اليوم", value: "4" },
      { icon: Wallet, label: "إيرادات الشهر", value: "18,400 ر.س" },
    ],
    tableTitle: "أحدث أوامر الفحص",
    rows: [
      ["ORD-0001", "محمد الشرعبي", "فحص دم شامل", "مكتمل"],
      ["ORD-0002", "فاطمة الشميري", "سكر صائم", "قيد التنفيذ"],
      ["ORD-0003", "عبدالله النزيلي", "تحليل بول", "بانتظار العينة"],
      ["ORD-0004", "هدى القباطي", "وظائف كبد", "تم إصدار النتيجة"],
    ],
  },
  {
    key: "optometry",
    icon: Eye,
    name: "نظام عيادة العيون",
    tagline: "إدارة المرضى والمواعيد والفحوصات البصرية ووصفات النظارات والعدسات والفواتير لعيادتك.",
    stats: [
      { icon: Users, label: "المرضى", value: "680" },
      { icon: CalendarDays, label: "مواعيد اليوم", value: "23" },
      { icon: Receipt, label: "فواتير اليوم", value: "18" },
      { icon: Wallet, label: "إيرادات الشهر", value: "96,000 ر.س" },
    ],
    tableTitle: "مواعيد اليوم",
    rows: [
      ["أحمد الحميري", "فحص قاع العين", "09:00", "مؤكد"],
      ["سارة العنسي", "قياس النظر", "10:30", "مؤكد"],
      ["خالد الشامي", "متابعة", "12:00", "منتظر"],
      ["نورة الحكيمي", "وصفة نظارة", "14:00", "مؤكد"],
    ],
  },
  {
    key: "pos",
    icon: Store,
    name: "نظام نقاط البيع",
    tagline: "نقاط بيع سريعة مع باركود، وإدارة المنتجات والمخازن والمبيعات والعملاء والموردين والصندوق.",
    stats: [
      { icon: ShoppingCart, label: "مبيعات اليوم", value: "62" },
      { icon: Wallet, label: "إيرادات اليوم", value: "4,180 ر.س" },
      { icon: Package, label: "المنتجات", value: "1,240" },
      { icon: Users, label: "العملاء", value: "210" },
    ],
    tableTitle: "أحدث الفواتير",
    rows: [
      ["INV-1058", "أحمد عبدالله", "اليوم", "840 ر.س"],
      ["INV-1057", "سوبر ماركت النور", "اليوم", "1,560 ر.س"],
      ["INV-1056", "مطعم الشرق", "أمس", "720 ر.س"],
      ["INV-1055", "فاطمة سالم", "أمس", "98 ر.س"],
    ],
  },
];

/* Standalone live demo systems: linked directly (proxied same-origin) instead
   of the 3-day trial flow. */
const LIVE_KEYS = new Set<SystemKey>(["grocery", "clinic", "cafe", "hospital", "dental", "pharmacy", "laboratory", "optometry", "pos"]);

/* Only the slugs differ from the registry; the mount path comes from there, so
   these cards cannot point at a path the platform does not serve. `clinic` is
   the catalog's name for the SAMA medical system, which registers as `sama`. */
const LIVE_HREF: Record<string, string> = {
  grocery: liveHref("grocery")!,
  clinic: liveHref("sama")!,
  cafe: liveHref("cafe")!,
  hospital: liveHref("hospital")!,
  dental: liveHref("dental")!,
  pharmacy: liveHref("pharmacy")!,
  laboratory: liveHref("laboratory")!,
  pos: liveHref("pos")!,
  optometry: liveHref("optometry")!,
};

export default function DemoPage() {
  const trial = useSyncExternalStore(subscribeDemoTrial, readDemoTrial, () => null);
  const [picked, setPicked] = useState<SystemKey>("grocery");
  const [now, setNow] = useState<Date>(() => new Date());

  // Keep the countdown ticking once a minute while the trial is active.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const activeTrial = trial && !isDemoExpired(trial, now) ? trial : null;
  const system = SYSTEMS.find((s) => s.key === picked) ?? SYSTEMS[0];

  return (
    <OnboardingShell>
      <ParticleCanvas count={PARTICLE_COUNT} intensity={PARTICLE_INTENSITY} />
      <main dir="rtl">
        <ScrollProgress />
        <div className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6">
          {!trial ? (
            <StartView />
          ) : activeTrial ? (
            <ActiveView trial={activeTrial} now={now} system={system} setPicked={setPicked} />
          ) : (
            <ExpiredView />
          )}
        </div>
      </main>
    </OnboardingShell>
  );
}

/* ── Scroll progress ──────────────────────────────────────── */

/** Thin gradient bar tracking page scroll. Hidden under reduced motion. */
function ScrollProgress() {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const fill = fillRef.current;
      if (!fill) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      fill.style.setProperty("--demo-progress", ratio.toFixed(4));
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-transparent">
      <div ref={fillRef} className="demo-progress-fill h-full w-full bg-gradient-to-l from-primary via-[#03EABC] to-[#0263D1]" />
    </div>
  );
}

/* ── Start screen (no signup) ───────────────────────────── */

function StartView() {
  const availableCount = BUSINESS_SYSTEMS.filter((s) => s.status === "available").length;
  return (
    <div className="relative mb-10 text-center">
      {/* Ambient orbs — drift slowly behind the hero. Decorative only. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-80 overflow-hidden">
        <div className="animate-float-slow absolute top-6 right-[8%] h-56 w-56 rounded-full bg-primary/[0.07] blur-[90px]" />
        <div
          className="animate-float-slow absolute top-24 left-[10%] h-48 w-48 rounded-full bg-[#0263D1]/[0.07] blur-[90px]"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="animate-float-slow absolute top-0 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-[#03EABC]/[0.05] blur-[80px]"
          style={{ animationDelay: "-9s" }}
        />
      </div>

      <ScrollReveal distance={40}>
        <h1 className="animate-fade-in-up bg-gradient-to-l from-white via-primary to-white bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
          جرّب Business OS مجاناً
        </h1>
      </ScrollReveal>
      {/* One text, organized: the same wording as the merged copy, laid out as
          icon chips + a catalog card + the closing tagline. */}
      <ScrollReveal delay={120} distance={30}>
        <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-white/65">
          استكشف أنظمة Business OS كاملة ببيانات تجريبية جاهزة —{" "}
          <strong className="font-semibold text-white/85">بدون تسجيل أو بطاقة ائتمان.</strong>
        </p>
      </ScrollReveal>

      <ScrollReveal delay={240} distance={24}>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {[
            { icon: ShieldCheck, label: "بدون تسجيل أو بطاقة ائتمان" },
            { icon: Database, label: "بيانات تجريبية جاهزة" },
          ].map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-white/70 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-white"
            >
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </li>
          ))}
          <li className="demo-sheen inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/15">
            <KeyRound className="h-4 w-4" />
            الدخول التجريبي: <span className="font-mono text-white/80">demo / demo123</span>
          </li>
        </ul>
      </ScrollReveal>

      <ScrollReveal delay={360} distance={24}>
        <div className="demo-card mx-auto mt-6 flex w-full max-w-2xl items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-start backdrop-blur-xl transition-colors duration-300 hover:border-primary/30">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed text-white/60">
            اكتشف{" "}
            <strong className="font-semibold text-white/85">
              {BUSINESS_SYSTEMS.length} نظاماً عبر {SYSTEM_CATEGORIES.length} فئة
            </strong>
            ، واختر الحل المناسب لأعمالك. أنشئ حسابك فقط عندما تكون جاهزاً لحفظ بياناتك الحقيقية.
            {availableCount > 0 && ` منها ${availableCount} أنظمة تعمل الآن بنسخ حية.`}
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={480} distance={20}>
        <p className="mt-6 inline-flex items-center gap-2 text-sm font-bold tracking-wide text-primary">
          <Sparkles className="h-4 w-4 animate-pulse" />
          حلول ذكية لإدارة كل أنواع الأعمال.
        </p>
      </ScrollReveal>

      <BusinessSystemsSection />
    </div>
  );
}

/* ── Active trial: the demo workspace + countdown ───────── */

function ActiveTrialBanner({ trial, now }: { trial: DemoTrial; now: Date }) {
  const elapsed = 1 - demoRemainingPartsToFraction(trial, now);

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/[0.08] p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Timer className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold text-white">نسختك التجريبية نشطة — بدون تسجيل</div>
          <div className="mt-0.5 text-xs text-white/60">
            مفتوحة دائمًا · {trial.system === "store" ? "متجر تجريبي" : trial.system === "grocery" ? "نظام بقاله" : trial.system === "clinic" ? "نظام علاج طبيعي" : "نظام اداره المقاهي"}
          </div>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10 sm:w-56">
            <div
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-l from-primary to-[#03EABC] transition-all duration-1000"
              style={{ width: `${Math.min(100, Math.max(6, elapsed * 100))}%` }}
            >
              <span className="demo-progress-sheen" />
            </div>
          </div>
        </div>
      </div>
      <Link
        href="/signup"
        className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-white"
      >
        احتفظ ببياناتك لاحقاً — أنشئ حساباً
      </Link>
    </div>
  );
}

/** Fraction of the trial already used (0..1). */
function demoRemainingPartsToFraction(trial: DemoTrial, now: Date): number {
  const total = DEMO_DURATION_MS;
  const used = now.getTime() - new Date(trial.startedAt).getTime();
  return Math.min(1, Math.max(0, used / total));
}

function ActiveView({
  trial,
  now,
  system,
  setPicked,
}: {
  trial: DemoTrial;
  now: Date;
  system: SystemDef;
  setPicked: (s: SystemKey) => void;
}) {
  return (
    <>
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm text-primary">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          وضع العرض التجريبي — نشط مجاناً
        </div>
        <h1 className="text-4xl font-extrabold text-white sm:text-5xl">تجربة الأنظمة مباشرة</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/60">
          استكشف أنظمة Business OS ببيانات تجريبية حية، ثم أنشئ حسابك لتبدأ نظامك الحقيقي.
        </p>
      </div>

      <ActiveTrialBanner trial={trial} now={now} />

      {/* System tabs */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
        {SYSTEMS.map((s) =>
          LIVE_KEYS.has(s.key) ? (
            <a
              key={s.key}
              href={LIVE_HREF[s.key]}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 ${
                system.key === s.key
                  ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
                  : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
              }`}
            >
              <s.icon className="h-5 w-5" />
              {s.name}
            </a>
          ) : (
            <button
              key={s.key}
              onClick={() => setPicked(s.key)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 ${
                system.key === s.key
                  ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
                  : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
              }`}
            >
              <s.icon className="h-5 w-5" />
              {s.name}
            </button>
          ),
        )}
      </div>

      {/* Demo dashboard — re-keyed on the system so switching cross-fades. */}
      <div key={system.key} className="animate-fade-in-up">
        {LIVE_EMBED_HREF[system.key] ? (
          <LiveEmbed system={system} />
        ) : (
          <StaticDashboard system={system} />
        )}
      </div>

      {/* CTA */}
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          أنشئ حسابك واحتفظ ببياناتك
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Link>
        <Link href="/systems" className="text-sm text-white/60 hover:text-white">
          اختر نظامك وابدأ من الصفر بدلاً من ذلك
        </Link>
      </div>
    </>
  );
}

/* ── Live embed vs static demo dashboards ─────────────── */

/** Systems whose real standalone app is embedded live via iframe. */
const LIVE_EMBED_HREF: Record<string, string> = {
  grocery: liveHref("grocery")!,
  hospital: liveHref("hospital")!,
  dental: liveHref("dental")!,
  pharmacy: liveHref("pharmacy")!,
  laboratory: liveHref("laboratory")!,
  pos: liveHref("pos")!,
  optometry: liveHref("optometry")!,
};

function LiveEmbed({ system }: { system: SystemDef }) {
  const href = LIVE_EMBED_HREF[system.key];
  if (!href) return null;
  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <system.icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{system.name}</h2>
              <span className="demo-sheen inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                النسخة الحية
              </span>
            </div>
            <p className="text-xs text-white/60">
              بيانات الدخول التجريبية: <span className="font-mono text-white/70">demo</span> /{" "}
              <span className="font-mono text-white/70">demo123</span>
            </p>
          </div>
        </div>
        <a
          href={LIVE_HREF[system.key]}
          target="_blank"
          rel="noopener noreferrer"
          className="demo-sheen inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98]"
        >
          افتح في تبويب جديد
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <iframe
        src={href}
        title={system.name}
        className="h-[560px] w-full bg-white sm:h-[680px] lg:h-[760px]"
      />
      <p className="border-t border-white/[0.08] px-5 py-3 text-center text-xs text-white/40">
        البيانات المعروضة تجريبية لأغراض العرض فقط — نظامك الحقيقي يبدأ فور إنشاء حسابك.
      </p>
    </div>
  );
}

function StaticDashboard({ system }: { system: SystemDef }) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <system.icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{system.name}</h2>
            <p className="text-sm text-white/60">{system.tagline}</p>
          </div>
        </div>
        <Link
          href="/signup"
          className="group inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:brightness-110 active:scale-[0.98]"
        >
          ابدأ نسختك الحقيقية مجاناً
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1 rtl:rotate-180" />
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {system.stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 transition-all hover:border-primary/40"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <stat.icon className="h-5 w-5" />
            </div>
            <div className="text-2xl font-extrabold text-white">{stat.value}</div>
            <div className="mt-1 text-sm text-white/60">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.08] px-5 py-4 font-semibold text-white">{system.tableTitle}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.03] text-white/50">
                {system.rows[0].map((_, i) => (
                  <th key={i} className="px-5 py-3 text-start font-medium">
                    العمود {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {system.rows.map((row, i) => (
                <tr key={i} className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.03]">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-5 py-3 text-white/80 ${j === 0 ? "font-semibold text-white" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-white/40">
        البيانات المعروضة تجريبية لأغراض العرض فقط — نظامك الحقيقي يبدأ فور إنشاء حسابك.
      </p>
    </div>
  );
}

/* ── Expired trial ──────────────────────────────────────── */

function ExpiredView() {
  return (
    <div className="mb-10 text-center">
      <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 text-primary">
        <Lock className="h-10 w-10" />
      </div>
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-sm text-white/50">
        انتهت النسخة التجريبية
      </div>
      <h1 className="text-4xl font-extrabold text-white sm:text-5xl">انتهت أيام النسخة المجانية</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
        شكراً لتجربة Business OS! أنشئ حسابك خلال دقيقة وبلا بطاقة ائتمان
        لتبدأ نظامك الحقيقي ببياناتك الخاصة.
      </p>
      <Link
        href="/signup"
        className="demo-sheen group mt-10 inline-flex items-center gap-2.5 rounded-2xl bg-primary px-10 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:brightness-110 active:scale-[0.98]"
      >
        إنشاء حساب جديد — مجاناً
        <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1 rtl:rotate-180" />
      </Link>
      <p className="mt-4 text-xs text-white/40">
        ابدأ مجدداً على جهاز آخر إذا أردت تجربة أخرى.
      </p>
    </div>
  );
}