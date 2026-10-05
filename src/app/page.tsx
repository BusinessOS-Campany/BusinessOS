"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import {
  Package, ShoppingCart, Receipt, Wallet, Monitor, BarChart3,
  Shield, Globe, ArrowLeft, CheckCircle2, Sparkles, Zap, Users,
  LayoutDashboard, Settings, TrendingUp, Star, CreditCard, Boxes,
  Store, Home, LayoutGrid, ListChecks, Rocket, ChevronDown,
  LogIn, UserPlus, User,
  Clock, SlidersHorizontal, Webhook, ScanLine, WifiOff, DatabaseBackup,
} from "lucide-react";
import ScrollReveal from "@/components/landing/scroll-reveal";
import TiltCard from "@/components/landing/tilt-card";
import Parallax from "@/components/landing/parallax";
import MouseGlow from "@/components/landing/mouse-glow";
import MagneticButton from "@/components/landing/magnetic-button";
import TextScramble from "@/components/landing/text-scramble";
import GlowCard from "@/components/landing/glow-card";
import SplitText from "@/components/landing/split-text";
import ViewTransition from "@/components/landing/view-transition";
import AiChatModal from "@/components/landing/ai-chat";
import MusicPlayer from "@/components/landing/music-player";
import { authClient } from "@/core/auth/client";

/* ── 3D Hero (lazy-loaded, excluded from server render) ─── */
const Hero3D = dynamic(() => import("@/components/landing/hero-3d"), {
  ssr: false,
  loading: () => null,
});

/* ── The landing is a single page: navbar links swap the view ── */
type PageKey =
  | "home"
  | "features"
  | "stats"
  | "highlights"
  | "testimonials"
  | "how"
  | "cta";

const NAV_PAGES: { key: PageKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "features", label: "المميزات", icon: LayoutGrid },
  { key: "stats", label: "الأرقام", icon: BarChart3 },
  { key: "highlights", label: "العربية", icon: Globe },
  { key: "testimonials", label: "آراء العملاء", icon: Star },
  { key: "how", label: "كيف يعمل", icon: ListChecks },
  { key: "cta", label: "ابدأ الآن", icon: Rocket },
];

/* A rail entry that navigates rather than switching the in-page view. */
type RailLink = {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/* Sign in / sign up, as rail tiles rather than text pills. A signed-in visitor
   gets a single profile tile in their place — the same swap components/user-nav.tsx
   makes in the shared shell header, for the same reason. */
const AUTH_RAIL: RailLink[] = [
  { key: "auth-signin", href: "/signin", label: "تسجيل الدخول", icon: LogIn },
  { key: "auth-signup", href: "/signup", label: "إنشاء حساب", icon: UserPlus },
];
const PROFILE_RAIL: RailLink[] = [
  { key: "auth-profile", href: "/profile", label: "الملف الشخصي", icon: User },
];

/* ── SVG ──────────────────────────────────────────────── */

function HeadsetIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

/* ── Data ──────────────────────────────────────────────── */

/* ── Features ────────────────────────────────────────────────────────────────
 * Every line below is grounded in code that exists. The previous version of this
 * array was six generic cards, and two of them advertised things the product does
 * not have: `الميزانيات` (there is no budget feature anywhere in the app) and
 * `تكاليف الشحن` (no shipping-cost field). What replaced them is grounded in the
 * systems marketplace, the six roles and the approval-gated install flow.
 *
 * `سجل التدقيق` is deliberately absent. `src/app/app/audit/page.tsx` is a
 * placeholder that renders "سجل التدقيق متاح عبر API", and no `/api/v1/audit`
 * route exists anywhere in the app. It should not be advertised until built.
 *
 * The `grocery` and `sama-center` vertical suites were written up here and then
 * cut on request, so nothing on this page advertises them. */

type FeatureItem = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  color: string;
};

/* The same four brand gradients the rest of the page uses, so a 24-card grid
   still reads as one palette instead of a paint box. */
const GRAD_A = "from-primary to-[#0263D1]";
const GRAD_B = "from-[#03EABC] to-[#0263D1]";
const GRAD_C = "from-[#0263D1] to-primary";
const GRAD_D = "from-primary to-[#03EABC]";

/* ── 1. The working modules of the core ERP ─────────────────────────────────
 * Twelve of the thirteen sidebar modules. Order follows the real workflow:
 * sell → stock → buy → money → run. */
const coreModules: FeatureItem[] = [
  { icon: Monitor, title: "نقطة البيع", desc: "بيع سريع بالباركود، وتعليق الفاتورة واستئنافها لاحقاً، ودفع نقدي أو بالبطاقة، وإرفاق العميل مع التحقق من حد الائتمان.", color: GRAD_A },
  { icon: Receipt, title: "المبيعات", desc: "سجل فواتير يعرض المبلغ والمدفوع والمتبقي، وحالة تتحدّث تلقائياً إلى مدفوعة أو جزئية أو غير مدفوعة.", color: GRAD_B },
  { icon: Package, title: "المنتجات", desc: "اسم بالعربية والإنجليزية، ورمز SKU والباركود، وثلاثة أسعار — تكلفة وبيع وجملة — مع نسبة ضريبة وحد أدنى للمخزون.", color: GRAD_C },
  { icon: Boxes, title: "المخزون والمستودعات", desc: "مستودعات متعددة بأسماء عربية وإنجليزية، مع تحديد المستودع الرئيسي الذي تعتمد عليه بقية العمليات.", color: GRAD_D },
  { icon: Users, title: "العملاء", desc: "بيانات العميل وحدود الائتمان والرصيد المستحق، مع ظهور الديون مباشرة في لوحة المؤشرات والتقارير.", color: GRAD_A },
  { icon: Store, title: "الموردون", desc: "دليل موحّد للموردين مع الهاتف والحالة والملاحظات، وبحث سريع للوصول إلى السجل المطلوب.", color: GRAD_B },
  { icon: ShoppingCart, title: "المشتريات", desc: "متابعة فواتير الشراء والمدفوع والمتبقي لكل عملية، بنفس منطق حالات السداد في المبيعات.", color: GRAD_C },
  { icon: Wallet, title: "المصروفات", desc: "تسجيل المصروفات بالتصنيف والحساب النقدي وطريقة الدفع والتاريخ، مع تعديل وحذف كاملين.", color: GRAD_D },
  { icon: TrendingUp, title: "المالية", desc: "ملخص فوري لأربعة أرقام أساسية: المبيعات، صافي الربح، التدفق الداخل، والتدفق الخارج.", color: GRAD_A },
  { icon: BarChart3, title: "التقارير", desc: "أربعة تقارير بفترة تختارها من 7 أو 30 أو 90 أو 365 يوماً: ملخص المبيعات، الربح ونسبته، قيمة المخزون، والديون.", color: GRAD_B },
  { icon: Zap, title: "الأتمتة", desc: "قواعد تُنفَّذ تلقائياً عند بيع جديد أو تنبيه مخزون منخفض أو فاتورة متأخرة أو عميل جديد.", color: GRAD_C },
  { icon: Settings, title: "الإدارة", desc: "تشغيل الوحدات وإيقافها، وإدارة المستخدمين وتوزيع الأدوار، وتخصيص ألوان النظام وشعاره.", color: GRAD_D },
];

/* ── 2. Platform capabilities ───────────────────────────────────────────────
 * The cross-cutting layer: things that apply to every module rather than
 * belonging to one. The API-backed ones have no UI screen of their own yet, so
 * the copy stays at the capability level. */
const platformCapabilities: FeatureItem[] = [
  { icon: LayoutGrid, title: "١٩٦ نظاماً جاهزاً", desc: "متجر أنظمة كامل موزّع على 19 قطاعاً، وحالة كل نظام واضحة: متاح للتجربة أو مثبّت أو قيد الموافقة.", color: GRAD_A },
  { icon: Shield, title: "ستة أدوار جاهزة", desc: "مالك، مدير، مشرف، كاشير، محاسب، مشاهد — مع صلاحيات دقيقة لكل دور داخل كل وحدة.", color: GRAD_B },
  { icon: Clock, title: "تثبيت باعتماد", desc: "طلب النظام يمر بمراجعة قبل التفعيل على مؤسستك، بدل أن يظهر كل شيء دفعة واحدة.", color: GRAD_C },
  { icon: Globe, title: "تعدد المؤسسات", desc: "عزل كامل للبيانات بين المؤسسيات، مع هوية بصرية مخصصة لكل منها.", color: GRAD_D },
  { icon: SlidersHorizontal, title: "حقول مخصصة", desc: "أضف حقولاً وحسابات خاصة بنشاطك دون تعديل النظام نفسه.", color: GRAD_A },
  { icon: Webhook, title: "مفاتيح API وويب هوك", desc: "اربط نظامك بخارجي: مفاتيح قابلة للإلغاء، وويب هوك يرسل إشعاراً عند كل حدث مهم.", color: GRAD_B },
  { icon: ArrowLeft, title: "استيراد وتصدير", desc: "استيراد بمرحلتين — تحقق ثم اعتماد — لا يُطبَّق إلا بعد مراجعة البيانات.", color: GRAD_C },
  { icon: Sparkles, title: "مساعد ذكي", desc: "مساعد يجيب عن أسئلتك عن بياناتك، ويطلب تأكيدك قبل تنفيذ أي إجراء.", color: GRAD_D },
  { icon: ScanLine, title: "باركود وطباعة", desc: "قراءة باركود للعناصر والفواتير، وإيصالات وفواتير جاهزة للطباعة بمقاسات مختلفة.", color: GRAD_A },
  { icon: WifiOff, title: "عمل دون اتصال", desc: "تشغيل مستمر بلا شبكة، ومزامنة تلقائية عند عودة الاتصال.", color: GRAD_B },
  { icon: DatabaseBackup, title: "نسخ احتياطي", desc: "إنشاء النسخ والتحقق من سلامتها قبل الاعتماد عليها.", color: GRAD_C },
  { icon: Monitor, title: "تطبيق ويب قابل للتثبيت", desc: "بيان تطبيق وملف خدمة حقيقيان، فيعمل كتطبيق على جهازك لا كصفحة متصفح فقط.", color: GRAD_D },
];

/* ── 4. The 19 marketplace categories, verbatim from the catalogue ────────── */
const industries = [
  "الرعاية الصحية", "متاجر التجزئة", "المطاعم والمقاهي", "الضيافة والفنادق",
  "المالية والمحاسبة", "الإنشاءات والمقاولات", "السيارات", "التعليم",
  "الخدمات المهنية", "العقارات", "الخدمات اللوجستية", "التصنيع",
  "التجميل والعناية", "اللياقة والرياضة", "خدمات الأعمال", "التجارة الإلكترونية",
  "المواقع والمتاجر الإلكترونية", "الزراعة", "المؤسسات",
];

const statsData = [
  { to: 196, display: "+١٩٦", label: "نظام في الكتالوج", icon: Store },
  { to: 24, display: "٢٤/٧", label: "دعم فني مباشر", icon: HeadsetIcon },
  { to: 99, display: "٩٩.٩٪", label: "وقت التشغيل", icon: Shield },
  { to: 3, display: "٣ دقائق", label: "إعداد سريع", icon: Zap },
];

const testimonials = [
  { name: "أحمد العلي", role: "مدير متجر تقنية", text: "بيزنس أو إس غيّر طريقة إدارتي لمتجر. التقارير دقيقة والواجهة سهلة جداً.", stars: 5 },
  { name: "فاطمة الزهراء", role: "صاحبة صيدلية", text: "نظام ممتاز لإدارة المخزون. التنبيهات التلقائية وفّرت عليّ ساعات من العمل.", stars: 5 },
  { name: "محمد السعود", role: "مدير مطعم", text: "أفضل نظام نقطة بيع استخدمته. سريع وبسيط ويدعم كل احتياجاتنا.", stars: 5 },
];

/* ── Floating Particles ──────────────────────────────── */

const FLOAT_PARTICLES = Array.from({ length: 20 }, () => ({
  width: 2 + Math.random() * 4,
  height: 2 + Math.random() * 4,
  left: Math.random() * 100,
  top: Math.random() * 100,
  duration: 6 + Math.random() * 8,
  delay: Math.random() * 5,
}));

function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function FloatingParticles() {
  const mounted = useIsMounted();
  if (!mounted) return null;
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
      {FLOAT_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-primary/20"
          style={{
            width: `${p.width}px`,
            height: `${p.height}px`,
            left: `${p.left}%`,
            top: `${p.top}%`,
            animation: `float-particle ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Hero cursor glow (follows the mouse — "live" feel) ── */

function HeroGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 40 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        setPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      });
    };
    el.addEventListener("mousemove", handleMove);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700"
      style={{
        background: `radial-gradient(560px circle at ${pos.x}px ${pos.y}px, rgba(3,234,188,0.07), transparent 55%)`,
      }}
    />
  );
}

/* ── Page section headings ─────────────────────────────── */

function SectionHeading({ badge, title, desc }: { badge: string; title: React.ReactNode; desc?: string }) {
  return (
    <ScrollReveal>
      <div className="mb-14 text-center">
        <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">{badge}</span>
        <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">{title}</h2>
        {desc ? <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{desc}</p> : null}
      </div>
    </ScrollReveal>
  );
}

/* ── Views ─────────────────────────────────────────────── */

function HomeView() {
  const mounted = useIsMounted();
  return (
    <section className="relative isolate flex h-screen overflow-hidden">
      <FloatingParticles />
      <HeroGlow />

      {/* Live 3D wallpaper — the galaxy orb behind */}
      <Hero3D />

      {/* Soft dark vignette behind the copy so text stays readable over the bright orb */}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_center,rgba(2,6,23,0.5)_0%,rgba(2,6,23,0.28)_50%,transparent_78%)]" />

      <div className="relative z-10 pointer-events-none mx-auto my-auto w-full max-w-7xl select-none px-6 pt-14 pb-28 sm:pt-24 lg:pt-28 animate-fade-in-up">
        <div className="grid items-center gap-12">
          <div className="text-center">
            <ScrollReveal delay={0} direction="up" distance={40}>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-sm font-medium text-primary backdrop-blur-sm sm:mb-8">
                <Sparkles className="h-4 w-4" />
                منصة إدارة أعمال احترافية
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100} direction="up" distance={50}>
              <h1 className="mx-auto max-w-4xl text-[2.3rem] font-extrabold leading-[1.3] tracking-tight [filter:drop-shadow(0_2px_12px_rgba(2,6,23,0.75))_drop-shadow(0_1px_3px_rgba(2,6,23,0.6))] sm:text-6xl md:text-[4.8rem]" style={{ perspective: "1000px" }}>
                {mounted ? (
                  <SplitText text="كل ما تحتاجه لإدارة" className="inline" />
                ) : (
                  "كل ما تحتاجه لإدارة"
                )}{" "}
                <span className="relative inline-block" style={{ transformStyle: "preserve-3d" }}>
                  <span className="text-gradient">
                    {mounted ? <TextScramble text="أعمالك" speed={40} /> : "أعمالك"}
                  </span>
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 8C40 2 160 2 198 8" stroke="currentColor" strokeWidth="3" className="text-primary/30" strokeLinecap="round" />
                  </svg>
                </span>
                <br />
                <span className="text-white">
                  {mounted ? <TextScramble text="من أي مكان في العالم" speed={25} /> : "من أي مكان في العالم"}
                </span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200} direction="up" distance={50}>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-foreground/85 [filter:drop-shadow(0_1px_10px_rgba(2,6,23,0.85))] sm:mt-8 md:text-xl">
                نظام متكامل لإدارة متجرك أو مؤسستك — مخزون، مبيعات، مشتريات، مالية،
                ونقاط بيع. متعدد المستأجرين ويدعم الهوية البصرية الخاصة بك.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={300} direction="up" distance={40}>
              <div className="pointer-events-auto mt-5 flex flex-col items-center justify-center gap-4 sm:mt-12 sm:flex-row">
                <MagneticButton strength={0.15}>
                  <Link href="/systems" className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-primary px-10 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98]">
                    <Zap className="h-5 w-5" />
                    اختر نظامك
                    <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1 rtl:rotate-180" />
                    <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </MagneticButton>
                <MagneticButton strength={0.15}>
                  <Link href="/demo" className="group relative inline-flex items-center gap-2.5 rounded-2xl border border-white/20 bg-white/[0.06] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-white/10 active:scale-[0.98]">
                    <Sparkles className="h-5 w-5 text-primary" />
                    جرب مجانا
                    <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </MagneticButton>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={400} direction="up" distance={30}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-foreground/80 [filter:drop-shadow(0_1px_8px_rgba(2,6,23,0.85))] sm:mt-14">
                {["مجانا للتجربه", "بدون بطاقة ائتمان", "إعداد في دقائق"].map((t) => (
                  <span key={t} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {t}
                  </span>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* A feature card. `compact` drops the description for the platform grid, where
   twelve cards in one screen would otherwise be unreadable. */
function FeatureCard({ f, i, compact = false }: { f: FeatureItem; i: number; compact?: boolean }) {
  return (
    <ScrollReveal delay={Math.min(i, 9) * 60} direction="up" distance={compact ? 26 : 50}>
      <GlowCard className="h-full rounded-3xl">
        <MouseGlow className="h-full rounded-3xl">
          <TiltCard intensity={compact ? 4 : 8} className="h-full">
            <div className="group relative h-full overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-7 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10">
              <div className={`absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gradient-to-br ${f.color} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20`} />
              <div className="relative">
                <div className={`mb-5 flex items-center justify-center rounded-2xl bg-gradient-to-br ${f.color} text-white shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl ${compact ? "h-11 w-11" : "h-14 w-14"}`}>
                  <f.icon className={compact ? "h-5 w-5" : "h-7 w-7"} />
                </div>
                <h3 className={`mb-2.5 font-bold ${compact ? "text-base" : "text-xl"}`}>{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          </TiltCard>
        </MouseGlow>
      </GlowCard>
    </ScrollReveal>
  );
}

function FeaturesView() {
  return (
    <section className="relative isolate overflow-hidden">
      <FloatingParticles />
      <div className="mx-auto w-full max-w-7xl px-6 pt-24 pb-16">
        <SectionHeading
          badge="المميزات"
          title="كل ما يحتاجه عملك، في مكان واحد"
          desc="اثنتا عشرة وحدة أساسية، ومنصة تشغيل كاملة، و19 قطاعاً تغطيها الأنظمة — كل ما يلي مبني على ما يعمل فعلاً"
        />

        {/* 1 — the core modules */}
        <div className="mb-6 flex items-baseline gap-4">
          <h3 className="text-2xl font-bold sm:text-3xl">وحدات النظام الأساسية</h3>
          <span className="text-sm text-muted-foreground">{coreModules.length} وحدة</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {coreModules.map((f, i) => (
            <FeatureCard key={f.title} f={f} i={i} />
          ))}
        </div>

        {/* 2 — the cross-cutting platform layer */}
        <div className="mb-6 mt-24 flex items-baseline gap-4">
          <h3 className="text-2xl font-bold sm:text-3xl">منصة التشغيل</h3>
          <span className="text-sm text-muted-foreground">{platformCapabilities.length} ميزة</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platformCapabilities.map((f, i) => (
            <FeatureCard key={f.title} f={f} i={i} compact />
          ))}
        </div>

        {/* 3 — the catalogue's own sectors, so a visitor can find their trade
            without reading all 196 entries. */}
        <div className="mb-6 mt-24 flex flex-wrap items-baseline gap-4">
          <h3 className="text-2xl font-bold sm:text-3xl">قطاعات تغطيها الأنظمة</h3>
          <span className="text-sm text-muted-foreground">{industries.length} قطاعاً</span>
        </div>
        <ScrollReveal direction="up" distance={26}>
          <div className="flex flex-wrap justify-center gap-2.5">
            {industries.map((name, i) => (
              <span
                key={name}
                className="rounded-full border border-border/60 bg-card/50 px-4 py-2 text-sm text-foreground/85 backdrop-blur-sm transition-colors duration-200 hover:border-primary/40 hover:text-primary"
                style={{ transitionDelay: `${Math.min(i, 14) * 25}ms` }}
              >
                {name}
              </span>
            ))}
          </div>
        </ScrollReveal>

        {/* 4 — close the page on the two things the visitor can actually do next */}
        <ScrollReveal direction="up" distance={30}>
          <div className="mt-20 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2.5 rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98]"
            >
              <Sparkles className="h-5 w-5" />
              جرّب النظام الآن
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2.5 rounded-2xl border border-white/20 bg-white/[0.06] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-white/10 active:scale-[0.98]"
            >
              أنشئ حسابك
              <ArrowLeft className="h-5 w-5 transition-transform hover:-translate-x-1 rtl:rotate-180" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function StatsView() {
  return (
    <section className="relative isolate flex min-h-screen items-center overflow-hidden">
      <FloatingParticles />
      <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-10">
        <SectionHeading badge="الأرقام" title="أرقام تتحدث عنا" />
        <Parallax speed={0.15}>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {statsData.map((s, i) => (
              <ScrollReveal key={s.label} delay={i * 100} direction="scale" distance={30}>
                <MouseGlow className="h-full rounded-3xl">
                  <div className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/50 p-8 text-center backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                    <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-primary/5 transition-all duration-500 group-hover:scale-150 group-hover:bg-primary/10" />
                    <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-lg group-hover:shadow-primary/30 group-hover:rotate-12">
                      <s.icon className="h-7 w-7" />
                    </div>
                    <div className="relative text-4xl font-extrabold text-foreground sm:text-5xl">
                      {s.display}
                    </div>
                    <div className="relative mt-2 text-sm text-muted-foreground">{s.label}</div>
                  </div>
                </MouseGlow>
              </ScrollReveal>
            ))}
          </div>
        </Parallax>

        <ScrollReveal direction="rotate" distance={20}>
          <div className="mt-16" style={{ perspective: "1200px" }}>
            <div
              className="relative rounded-3xl border border-border/60 bg-card/50 p-3 shadow-2xl shadow-primary/5 backdrop-blur-sm"
              style={{
                transformStyle: "preserve-3d",
                transform: "rotateX(2deg) rotateY(-1deg)",
                transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(20px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "rotateX(2deg) rotateY(-1deg)"; }}
            >
              <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-400/70" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
                <div className="h-3 w-3 rounded-full bg-green-400/70" />
                <div className="mx-auto flex items-center gap-1.5 rounded-lg bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  businessos.app
                </div>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-4 sm:grid-rows-3">
                <div className="hidden rounded-2xl border border-border/40 bg-secondary/30 p-4 sm:row-span-3 sm:block">
                  <div className="mb-6 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/20" />
                    <div className="h-3 w-16 rounded bg-foreground/10" />
                  </div>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`mb-2 flex items-center gap-2.5 rounded-lg px-3 py-2 ${i === 1 ? "bg-primary/10" : ""}`}>
                      <div className={`h-4 w-4 rounded ${i === 1 ? "bg-primary/40" : "bg-foreground/8"}`} />
                      <div className={`h-2.5 rounded ${i === 1 ? "bg-primary/30" : "bg-foreground/6"} ${i % 2 === 0 ? "w-14" : "w-12"}`} />
                    </div>
                  ))}
                </div>
                {[
                  { label: "المبيعات", value: "٤٥,٢٠٠", change: "+١٢٪", color: "bg-primary/10 text-primary" },
                  { label: "العملاء", value: "١,٢٣٠", change: "+٨٪", color: "bg-primary/10 text-primary" },
                  { label: "المنتجات", value: "٣٤٢", change: "+٥", color: "bg-amber-500/10 text-amber-500" },
                  { label: "الطلبات", value: "٨٩", change: "+١٥٪", color: "bg-violet-500/10 text-violet-500" },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-2xl border border-border/40 bg-secondary/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.color}`}>
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-primary">{kpi.change}</span>
                    </div>
                    <div className="text-2xl font-bold">{kpi.value}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{kpi.label}</div>
                  </div>
                ))}
                <div className="sm:col-span-2 rounded-2xl border border-border/40 bg-secondary/20 p-4">
                  <div className="mb-3 text-xs font-medium text-muted-foreground">المبيعات الشهرية</div>
                  <div className="flex items-end gap-2 h-28">
                    {[40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 100].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-sm bg-primary/20 transition-all hover:bg-primary/40" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-border/40 bg-secondary/20 p-4">
                  <div className="mb-3 text-xs font-medium text-muted-foreground">آخر الطلبات</div>
                  <div className="space-y-2.5">
                    {[
                      { name: "طلب #١٢٣٤", amount: "١,٢٥٠ ر.س", status: "مكتمل" },
                      { name: "طلب #١٢٣٣", amount: "٨٩٠ ر.س", status: "قيد التنفيذ" },
                      { name: "طلب #١٢٣٢", amount: "٢,١٠٠ ر.س", status: "مكتمل" },
                    ].map((o) => (
                      <div key={o.name} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                        <div>
                          <div className="text-xs font-medium">{o.name}</div>
                          <div className="text-[10px] text-muted-foreground">{o.amount}</div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${o.status === "مكتمل" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600"}`}>{o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function HighlightsView() {
  return (
    <section className="relative isolate flex min-h-screen items-center overflow-hidden">
      <FloatingParticles />
      <div className="mx-auto w-full max-w-7xl px-6 pt-24 pb-10">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <ScrollReveal direction="right" distance={60}>
            <div>
              <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">مصمم للعمل العربي</span>
              <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">
                واجهة عربية
                <br />
                <span className="text-gradient">بالكامل</span>
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                واجهة عربية كاملة من اليمين لليسار مع دعم الهوية البصرية
                الخاصة بعلامتك التجارية. خيارات تخصيص الألوان والشعار.
              </p>
              <div className="mt-10 space-y-4">
                {[
                  { icon: LayoutDashboard, text: "واجهة عربية بالكامل (RTL)" },
                  { icon: Users, text: "تعدد المستأجرين مع هوية مخصصة" },
                  { icon: Globe, text: "تطبيق ويب قابل للتثبيت (PWA)" },
                  { icon: Settings, text: "تخصيص شامل حسب نوع النشاط" },
                ].map((item, j) => (
                  <ScrollReveal key={item.text} delay={j * 100} direction="right" distance={30}>
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/30 hover:scale-110">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span className="font-medium">{item.text}</span>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="left" distance={60} delay={200}>
            <div className="grid grid-cols-2 gap-4" style={{ perspective: "1000px" }}>
              {[
                { icon: Shield, title: "آمن وموثوق", desc: "تشفير كامل للبيانات ونسخ احتياطي تلقائي" },
                { icon: CreditCard, title: "المدفوعات", desc: "دعم جميع وسائل الدفع المحلية والعالمية" },
                { icon: Boxes, title: "لا حدود للبيانات", desc: "آلاف المنتجات والموردين والعملاء بدون قيود" },
              ].map((card, i) => (
                <GlowCard key={card.title} className={`${i === 2 ? "col-span-2" : ""} rounded-3xl`}>
                  <TiltCard intensity={10} className="h-full">
                    <div className="group flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card/60 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 h-full">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-lg group-hover:shadow-primary/30 group-hover:rotate-6 group-hover:scale-110">
                        <card.icon className="h-7 w-7" />
                      </div>
                      <span className="font-bold">{card.title}</span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{card.desc}</span>
                    </div>
                  </TiltCard>
                </GlowCard>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

function TestimonialsView() {
  return (
    <section className="relative isolate flex min-h-screen items-center overflow-hidden">
      <FloatingParticles />
      <div className="mx-auto w-full max-w-7xl px-6 pt-24 pb-10">
        <SectionHeading badge="آراء العملاء" title="يثق بنا آلاف العملاء" />
        <div className="grid gap-6 md:grid-cols-3" style={{ perspective: "1200px" }}>
          {testimonials.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 150} direction="up" distance={60}>
              <GlowCard className="h-full rounded-3xl">
                <MouseGlow className="h-full rounded-3xl">
                  <TiltCard intensity={6}>
                    <div className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-8 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 h-full">
                      <div className="absolute -top-16 -right-16 h-32 w-32 rounded-full bg-primary/5 transition-all duration-500 group-hover:scale-150" />
                      <div className="relative">
                        <div className="mb-4 flex gap-1">
                          {Array.from({ length: t.stars }).map((_, j) => (
                            <Star key={j} className="h-5 w-5 fill-amber-400 text-amber-400 transition-transform duration-300 hover:scale-125 hover:rotate-12" />
                          ))}
                        </div>
                        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">&ldquo;{t.text}&rdquo;</p>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                            {t.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{t.name}</div>
                            <div className="text-xs text-muted-foreground">{t.role}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TiltCard>
                </MouseGlow>
              </GlowCard>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowView() {
  return (
    <section className="relative isolate flex min-h-screen items-center overflow-hidden">
      <FloatingParticles />
      <div className="mx-auto w-full max-w-7xl px-6 pt-24 pb-10">
        <SectionHeading badge="كيف يعمل" title="ثلاث خطوات فقط" />
        <div className="grid gap-8 md:grid-cols-3" style={{ perspective: "1000px" }}>
          {[
            { step: "١", title: "اختر نظامك", desc: "حدد نوع نشاطك التجاري من بين الأنظمة المتاحة" },
            { step: "٢", title: "خصّص واجهتك", desc: "أضف شعاراتك وألوانك وبيانات شركتك" },
            { step: "٣", title: "ابدأ العمل", desc: "أضف منتجاتك وعملاءك وابدأ في إدارة أعمالك" },
          ].map((s, i) => (
            <ScrollReveal key={s.step} delay={i * 200} direction="up" distance={70}>
              <GlowCard className="h-full rounded-3xl">
                <TiltCard intensity={12} className="h-full">
                  <div className="relative flex flex-col items-center gap-6 rounded-3xl border border-border/60 bg-card/60 p-10 text-center backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 h-full">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-[#0263D1] text-3xl font-extrabold text-white shadow-xl shadow-primary/25 transition-all duration-300 hover:scale-110 hover:rotate-6 hover:shadow-2xl hover:shadow-primary/40">
                      {s.step}
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-bold">{s.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                </TiltCard>
              </GlowCard>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaView() {
  return (
    <section className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div className="w-full max-w-7xl px-6 pt-24">
        <Parallax speed={0.1}>
          <ScrollReveal direction="scale" distance={30}>
            <GlowCard glowColor="rgba(255,255,255,0.3)" className="rounded-[2rem]">
              <MouseGlow className="rounded-[2rem]">
                <div className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-bl from-[#0263D1] via-primary to-[#03EABC] px-8 py-20 text-center sm:px-16 animate-gradient">
                  <FloatingParticles />
                  <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
                  <div className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                  <div className="relative">
                    <h2 className="text-4xl font-extrabold text-white sm:text-5xl md:text-6xl">
                      جاهز لتنمية أعمالك؟
                    </h2>
                    <p className="mx-auto mt-6 max-w-xl text-lg text-white/80">
                      ابدأ الآن مجاناً واكتشف كيف يمكن لبيزنس أو إس أن يُحوّل طريقة
                      إدارة أعمالك.
                    </p>
                    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                      <MagneticButton strength={0.2}>
                        <Link href="/systems" className="group inline-flex items-center gap-2.5 rounded-2xl bg-white px-10 py-4 text-base font-bold text-[#0263D1] shadow-xl transition-all hover:shadow-2xl hover:brightness-110 active:scale-[0.98]">
                          اختر نظامك الآن
                          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1 rtl:rotate-180" />
                        </Link>
                      </MagneticButton>
                      <MagneticButton strength={0.2}>
                        <Link href="/demo" className="inline-flex items-center gap-2.5 rounded-2xl border-2 border-white/40 px-10 py-4 text-base font-semibold text-white transition-all hover:border-white/70 hover:bg-white/10">
                          <Sparkles className="h-5 w-5" />
                          جرب مجانا
                        </Link>
                      </MagneticButton>
                      <MagneticButton strength={0.2}>
                        <Link href="/signin" className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/30 px-10 py-4 text-base font-semibold text-white transition-all hover:border-white/50 hover:bg-white/10">
                          تسجيل الدخول
                        </Link>
                      </MagneticButton>
                    </div>
                  </div>
                </div>
              </MouseGlow>
            </GlowCard>
          </ScrollReveal>
        </Parallax>
      </div>

      <footer className="w-full border-t border-border/50 py-6 mt-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden"><img src="/icons/BO.webp" alt="Business OS" className="h-full w-full object-contain" /></div>
            <span className="text-sm font-bold">Business OS</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/signin" className="transition-colors hover:text-foreground">تسجيل الدخول</Link>
            <Link href="/systems" className="transition-colors hover:text-foreground">الأنظمة</Link>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} بيزنس أو إس. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </section>
  );
}

type RailTileProps = {
  row: { key: string; label: string; icon: React.ComponentType<{ className?: string }> };
  /** Stagger order for the open cascade. */
  index: number;
  /** Vertical position in tile-widths from the top of the burger. Fractional for
   *  the auth pair, which sits a quarter-tile lower to leave the pen's gap. */
  slot: number;
  hot: boolean;
  current: boolean;
  onHot: (index: number) => void;
  onCool: (index: number) => void;
  onSelect?: () => void;
  href?: string;
};

/* One rail tile: a square button holding an icon, with its label in a chip that
   slides out beside it on hover or keyboard focus. A <Link> for the auth
   entries, a <button> for the in-page view switcher, so only the switcher can
   carry `aria-current`.

   `slot` is passed rather than computed from `index` because the column is not
   uniformly spaced — the auth pair is offset by a quarter tile to open a gap
   where the old <hr> divider used to be. */
function RailTile({ row, index, slot, hot, current, onHot, onCool, onSelect, href }: RailTileProps) {
  const shared = {
    dir: "ltr" as const,
    className: `rail-tile${hot ? " is-hot" : ""}${current ? " is-current" : ""}`,
    style: { "--i": index, "--slot": slot } as CSSProperties,
    onPointerEnter: () => onHot(index),
    onPointerMove: () => onHot(index),
    onPointerLeave: () => onCool(index),
    onFocus: () => onHot(index),
    onBlur: () => onCool(index),
  };
  const inner = (
    <>
      <span className="rail-tile-icon">
        <row.icon className="h-[22px] w-[22px]" />
      </span>
      <span className="rail-tile-label">{row.label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} {...shared}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" {...shared} onClick={onSelect} aria-current={current ? "page" : undefined}>
      {inner}
    </button>
  );
}

/* ── Page ──────────────────────────────────────────────── */

export default function HomePage() {
  const [page, setPage] = useState<PageKey>("home");
  const [dockOpen, setDockOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);

  /* ── Session ──
   *
   * The rail and the mobile dock are the landing page's only chrome, and both
   * used to end in a hardcoded "تسجيل الدخول" / "إنشاء حساب" pair — so a signed-in
   * visitor was offered a sign-in link on their own front page. They now read the
   * session and swap in a single profile tile.
   *
   * Read on the client for the same reason components/user-nav.tsx does: this file
   * is "use client" and six files rendering the shared OnboardingShell are too, so
   * a server component calling next/headers() cannot be imported into this graph.
   *
   * While the session resolves we render NOTHING, again matching user-nav: showing
   * the signed-out pair first would flash "تسجيل الدخول" at someone who is signed
   * in, and they could click it. The rail is closed until a click, by which point
   * the answer is known, so the height change is never observed. */
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const authRail = signedIn ? PROFILE_RAIL : sessionPending ? [] : AUTH_RAIL;

  /* The open column's height, in tile-widths, is derived rather than hardcoded:
     7 page tiles end at slot 7, a quarter-tile gap follows, then the auth entries.
     Signed out that is 10.25, signed in 9.25, still-resolving 8.25. Writing it to
     --rail-slots keeps `.rail.is-open` correct for any auth-tile count. */
  const railSlots = NAV_PAGES.length + 0.25 + 1 + authRail.length;

  /* ── Rail state ──
   *
   * `railOpen` is the reference pen's `nav--open` class: closed, the nine tiles
   * sit exactly underneath the burger and are invisible; open, they cascade down
   * out from under it. Held as React state so the control is a real <button>
   * with `aria-expanded` rather than a class poked onto a node from a script.
   *
   * `hotRow` is which tile shows its label. Like the old tile label, it is
   * deliberately NOT driven by CSS `:hover`: the hero is covered by a
   * full-viewport Sketchfab iframe, and once the pointer enters that nested
   * document the parent stops receiving mouse events — so `:hover` latches
   * (measured: a 14-step glide out to the content, and a scroll, both failed to
   * clear it). A watchdog clears the label when the parent stops hearing about
   * the pointer; any pointer move over a tile re-arms it, so a resting cursor
   * keeps its label out. Without this the tile would also be left emerald with
   * no cursor anywhere near it. */
  const [railOpen, setRailOpen] = useState(false);
  const [hotRow, setHotRow] = useState<number | null>(null);
  const hotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const HOT_MS = 2500;

  const clearHotTimer = () => {
    if (hotTimer.current !== undefined) {
      clearTimeout(hotTimer.current);
      hotTimer.current = undefined;
    }
  };
  const markHot = (index: number) => {
    clearHotTimer();
    setHotRow(index);
    hotTimer.current = setTimeout(() => {
      hotTimer.current = undefined;
      setHotRow(null);
    }, HOT_MS);
  };
  const coolRow = (index: number) => {
    if (hotRow !== index) return;
    clearHotTimer();
    setHotRow(null);
  };
  useEffect(() => clearHotTimer, []);

  // Switching views always starts at the top of the new page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div className="noise-overlay">
      <main className="min-h-screen bg-background text-foreground" dir="rtl">
        {/* ═══════════════ RAIL — a column of tiles that cascades open ═══════════════ */}
        {/* Structure and motion follow the reference pen: a single square burger
            tile that morphs into an X, with the nav tiles hidden underneath it
            until it opens, at which point they cascade down one after another.
            Each tile reveals its label on hover or keyboard focus. The palette is
            ours — navy tiles, emerald accent — rather than the pen's purples.

            There is no card: the tiles float directly on the hero, as they do in
            the pen. The box is one tile tall closed and the full column tall
            open, and `.rail-wrap` re-centres it as it grows, so the burger ends
            up at the top of the column and the column stays vertically centred.

            `dir="ltr"` inside: the page is RTL, and the pen puts the icon on the
            physical left with the label running away from the edge. The Arabic
            labels still shape correctly (Unicode bidi). */}
        <div className="rail-wrap pointer-events-none fixed left-[5px] top-1/2 z-50 -translate-y-1/2">
          <nav
            aria-label="التنقل الرئيسي"
            dir="ltr"
            className={`rail pointer-events-auto${railOpen ? " is-open" : ""}`}
            style={{ "--rail-slots": railSlots } as CSSProperties}
          >
            <button
              type="button"
              className="rail-burger"
              aria-expanded={railOpen}
              aria-controls="rail-stack"
              aria-label={railOpen ? "طيّ القائمة" : "توسيع القائمة"}
              onClick={() => setRailOpen((v) => !v)}
            >
              <span className="rail-burger-bar" />
            </button>

            <div className="rail-stack" id="rail-stack">
              {NAV_PAGES.map((p, i) => (
                <RailTile
                  key={p.key}
                  row={p}
                  index={i}
                  slot={i + 1}
                  hot={hotRow === i}
                  current={page === p.key}
                  onHot={markHot}
                  onCool={coolRow}
                  onSelect={() => setPage(p.key)}
                />
              ))}

              {/* No <hr> any more: the auth entries are offset a quarter of a tile
                  lower, which opens the gap without a rule that would shift every
                  offset below it. Signed in this is a single profile tile, so the
                  column is one tile shorter — see --rail-slots above. */}
              {authRail.map((a, j) => {
                const index = NAV_PAGES.length + j;
                return (
                  <RailTile
                    key={a.key}
                    row={a}
                    index={index}
                    slot={NAV_PAGES.length + 0.25 + 1 + j}
                    hot={hotRow === index}
                    current={false}
                    onHot={markHot}
                    onCool={coolRow}
                    href={a.href}
                  />
                );
              })}
            </div>
          </nav>
        </div>

        {/* ═══════════════ the single view — swapped with a 3D transition ═══════════════ */}
        {/* `pb-24` clears the bottom dock, which now also covers narrow desktop
            (below the rail's 1280px breakpoint) — so the padding has to be
            dropped at 1280px, not 601px. */}
        <div className={`${page === "home" ? "h-screen overflow-hidden" : "min-h-screen pb-24 min-[1280px]:pb-0"}`}>
          <ViewTransition
            page={page}
            render={(p) =>
              p === "home" ? (
                <HomeView />
              ) : p === "features" ? (
                <FeaturesView />
              ) : p === "stats" ? (
                <StatsView />
              ) : p === "highlights" ? (
                <HighlightsView />
              ) : p === "testimonials" ? (
                <TestimonialsView />
              ) : p === "how" ? (
                <HowView />
              ) : (
                <CtaView />
              )
            }
          />
        </div>
      </main>

      {/* ═══════════════ MOBILE NAV — bottom dock with a plain-arrow toggle ═══════════════ */}
      {/* Rendered at the root (OUTSIDE <main>) so its `position: fixed` is never
          trapped by a transformed / filtered / overflow-hidden ancestor — it stays
          pinned to the viewport bottom through scroll and content growth. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] dock-wrap">
        {/* Toggle arrow — a bare chevron, no button chrome. Stays put when the
            bar slides away so the dock is always recoverable. `.dock-wrap` is
            forced to `display:block` by the media rule, so centering lives in
            this inner flex row (immune to that override). */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            aria-label={dockOpen ? "إخفاء شريط التنقل" : "إظهار شريط التنقل"}
            aria-expanded={dockOpen}
            className="pointer-events-auto relative z-10 flex h-6 w-20 -mb-3 items-center justify-center outline-none [-webkit-tap-highlight-color:transparent]"
          >
            <ChevronDown
              className={`h-4 w-4 text-foreground/45 transition-transform duration-300 hover:text-primary ${dockOpen ? "" : "rotate-180"}`}
              style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.8))" }}
            />
          </button>
        </div>

        <nav
          className={`pointer-events-auto relative flex w-full items-center gap-1 overflow-x-auto border-t border-white/10 bg-background/95 pt-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pl-2 pr-3 shadow-[0_-4px_24px_rgba(3,234,188,0.10),0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl [scrollbar-width:none] [touch-action:pan-x] transition-transform duration-300 ease-out [&::-webkit-scrollbar]:hidden ${dockOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            title="المساعد الذكي"
            aria-label="فتح المساعد الذكي"
            className="flex shrink-0 cursor-pointer items-center rounded-xl px-1.5 py-1 transition-colors hover:bg-white/10 outline-none [-webkit-tap-highlight-color:transparent]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden shadow-md shadow-primary/30">
              <img src="/icons/BO.webp" alt="Business OS" className="h-full w-full object-contain" />
            </div>
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-white/10" />

          {NAV_PAGES.map((p) => {
            const active = page === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPage(p.key)}
                className={`group flex shrink-0 flex-col items-center justify-center rounded-full px-3 py-2 text-muted-foreground outline-none transition-all duration-500 focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent] ${
                  active
                    ? "bg-primary/20 text-primary shadow-[0_0_18px_rgba(3,234,188,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]"
                    : "hover:bg-white/[0.07] hover:text-foreground active:scale-95"
                }`}
              >
                <p.icon className={`h-5 w-5 transition-all duration-500 ${active ? "text-primary drop-shadow-[0_0_6px_rgba(3,234,188,0.8)]" : "group-hover:text-primary"}`} />
                <span className={`mt-0.5 max-w-[3rem] truncate text-[9px] font-semibold leading-tight ${active ? "text-primary" : "text-muted-foreground opacity-80"}`}>
                  {p.label}
                </span>
              </button>
            );
})}

            <div className="mx-1 h-6 w-px shrink-0 bg-white/10" />

          {/* Same swap as the rail: a signed-in visitor gets their profile, not a
              sign-up pitch. The separator is dropped with the entry so a lone
              profile pill is not preceded by a stray divider. */}
          {signedIn ? (
            <Link
              href="/profile"
              aria-label="الملف الشخصي"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[0_0_18px_rgba(3,234,188,0.4)] transition-all hover:brightness-110 active:scale-95"
            >
              <User className="h-4 w-4" />
              حسابي
            </Link>
          ) : sessionPending ? null : (
            <Link
              href="/signup"
              className="shrink-0 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[0_0_18px_rgba(3,234,188,0.4)] transition-all hover:brightness-110 active:scale-95"
            >
              إنشاء حساب
            </Link>
          )}
        </nav>
      </div>

      <AiChatModal open={aiOpen} onClose={() => setAiOpen(false)} />
      <MusicPlayer />
    </div>
  );
}