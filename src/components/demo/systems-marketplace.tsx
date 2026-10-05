"use client";

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/core/auth/client";
import { isRequestableSystem } from "@/core/systems/system-app-map";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  Baby,
  BadgeCheck,
  Banknote,
  Bed,
  Beef,
  Bike,
  Bird,
  BookOpen,
  Box,
  Boxes,
  Briefcase,
  Bug,
  Building2,
  Calculator,
  Calendar,
  Car,
  CarFront,
  CarTaxiFront,
  ChartBar,
  Check,
  ChefHat,
  Circle,
  Clipboard,
  Clock,
  Code,
  Coffee,
  Cog,
  Coins,
  Compass,
  Cpu,
  Croissant,
  CupSoda,
  Droplets,
  Dumbbell,
  Eye,
  Factory,
  Fan,
  FileText,
  Flame,
  Flower,
  Footprints,
  Gauge,
  Gem,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  Hand,
  Handshake,
  HardHat,
  Headphones,
  Heart,
  Home,
  Hospital,
  Hotel,
  Key,
  Landmark,
  LandPlot,
  Languages,
  Layout,
  Leaf,
  Library,
  Map as MapIcon,
  Megaphone,
  Microscope,
  Milk,
  Monitor,
  Navigation,
  Package,
  Palette,
  PawPrint,
  Pencil,
  Percent,
  Pill,
  Plug,
  Presentation,
  Radar,
  Receipt,
  Repeat,
  RotateCw,
  Ruler,
  Scale,
  School,
  Scissors,
  Search,
  Settings,
  Shield,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  Smile,
  Sofa,
  Sparkles,
  SprayCan,
  Sprout,
  Stethoscope,
  Store,
  Ticket,
  Tractor,
  TrendingUp,
  Trophy,
  TreePalm,
  Truck,
  UserCog,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Warehouse,
  Waves,
  Wheat,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_MAP,
  SYSTEMS,
  type BusinessSystem,
  type SystemCategory,
} from "@/core/demo/systems-catalog";

/** Maps every catalog icon string to its lucide component (verified exports). */
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  baby: Baby,
  badge: BadgeCheck,
  bag: ShoppingBag,
  banknote: Banknote,
  bed: Bed,
  bike: Bike,
  bird: Bird,
  book: BookOpen,
  box: Box,
  boxes: Boxes,
  bread: Croissant,
  briefcase: Briefcase,
  bug: Bug,
  building: Building2,
  building2: Building2,
  calc: Calculator,
  calendar: Calendar,
  car: Car,
  carfront: CarFront,
  cart: ShoppingCart,
  chart: ChartBar,
  check: Check,
  chefhat: ChefHat,
  circle: Circle,
  clinic: Stethoscope,
  clipboard: Clipboard,
  clock: Clock,
  code: Code,
  coffee: Coffee,
  cog: Cog,
  coins: Coins,
  compass: Compass,
  cow: Beef,
  cpu: Cpu,
  cup: CupSoda,
  drawing: Pencil,
  droplets: Droplets,
  dumbbell: Dumbbell,
  eye: Eye,
  factory: Factory,
  fan: Fan,
  filetext: FileText,
  flame: Flame,
  flower: Flower,
  footprints: Footprints,
  fries: UtensilsCrossed,
  gauge: Gauge,
  gem: Gem,
  gift: Gift,
  globe: Globe,
  grad: GraduationCap,
  hammer: Hammer,
  hand: Hand,
  handshake: Handshake,
  hardhat: HardHat,
  headphones: Headphones,
  heart: Heart,
  home: Home,
  hospital: Hospital,
  hotel: Hotel,
  key: Key,
  landmark: Landmark,
  landplot: LandPlot,
  languages: Languages,
  layout: Layout,
  leaf: Leaf,
  library: Library,
  map: MapIcon,
  megaphone: Megaphone,
  microscope: Microscope,
  milk: Milk,
  monitor: Monitor,
  navigation: Navigation,
  package: Package,
  palette: Palette,
  palm: TreePalm,
  paw: PawPrint,
  pencil: Pencil,
  people: Users,
  percent: Percent,
  pill: Pill,
  plug: Plug,
  presentation: Presentation,
  radar: Radar,
  razor: Scissors,
  receipt: Receipt,
  repeat: Repeat,
  rotate: RotateCw,
  ruler: Ruler,
  scale: Scale,
  school: School,
  scissors: Scissors,
  settings: Settings,
  shield: Shield,
  ship: Ship,
  shirt: Shirt,
  smartphone: Smartphone,
  smile: Smile,
  sofa: Sofa,
  sparkles: Sparkles,
  spray: SprayCan,
  sprout: Sprout,
  steering: CarTaxiFront,
  stethoscope: Stethoscope,
  store: Store,
  ticket: Ticket,
  tractor: Tractor,
  trend: TrendingUp,
  trophy: Trophy,
  truck: Truck,
  usercog: UserCog,
  users: Users,
  utensils: Utensils,
  wallet: Wallet,
  warehouse: Warehouse,
  waves: Waves,
  wheat: Wheat,
  workflow: Workflow,
  wrench: Wrench,
};

type SortKey = "recommended" | "az" | "za" | "available" | "soon";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "الأنسب" },
  { key: "az", label: "أبجدي (أ – ي)" },
  { key: "za", label: "أبجدي (ي – أ)" },
  { key: "available", label: "المتاح الآن أولاً" },
  { key: "soon", label: "القريب أولاً" },
];

const statusRank = (s: BusinessSystem) =>
  s.status === "available" ? 0 : s.status === "dev" ? 1 : 2;
const statusRankSoon = (s: BusinessSystem) =>
  s.status === "soon" ? 0 : s.status === "dev" ? 1 : 2;

function sortSystems(items: BusinessSystem[], sort: SortKey): BusinessSystem[] {
  const arr = [...items];
  const byName = (a: BusinessSystem, b: BusinessSystem) =>
    a.nameAr.localeCompare(b.nameAr, "ar");
  switch (sort) {
    case "az":
      arr.sort(byName);
      break;
    case "za":
      arr.sort((a, b) => b.nameAr.localeCompare(a.nameAr, "ar"));
      break;
    case "available":
      arr.sort((a, b) => statusRank(a) - statusRank(b) || byName(a, b));
      break;
    case "soon":
      arr.sort((a, b) => statusRankSoon(a) - statusRankSoon(b) || byName(a, b));
      break;
    case "recommended":
    default:
      arr.sort((a, b) => statusRank(a) - statusRank(b) || byName(a, b));
  }
  return arr;
}

function StatusBadge({ status }: { status: BusinessSystem["status"] }) {
  if (status === "available") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        متاح الآن
      </span>
    );
  }
  if (status === "dev") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#26c6da]/40 bg-[#26c6da]/10 px-2.5 py-1 text-[11px] font-semibold text-[#7ee8f5]">
        قيد التطوير
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/45">
      قريباً
    </span>
  );
}

function SystemCard({
  system,
  actionLabel,
  signInOnSelect = false,
}: {
  system: BusinessSystem;
  actionLabel: string;
  signInOnSelect?: boolean;
}) {
  const Icon = ICONS[system.icon] ?? ICONS.box;
  const cat = CATEGORY_MAP[system.category];
  const available = system.status === "available" && Boolean(system.href);

  // When the marketplace is used as the sign-up entry (e.g. /systems), picking
  // a system sends the visitor to sign in first — or straight to their org
  // picker if they are already signed in. Demo mode keeps the direct live link.
  const { data: session } = useSession();
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const requestable = available && isRequestableSystem(system.id);
  const selectHref = session?.user ? `/select-org?system=${system.id}` : `/signin?system=${system.id}`;

  // Signed-in tenant: queue the platform approval request for the system's app,
  // then land on /my-apps where it shows under "قيد المراجعة" until an admin
  // approves it from /platform-admin/approvals. Never installs instantly.
  const requestSystem = async (e: MouseEvent) => {
    e.preventDefault();
    if (requesting) return;
    setRequesting(true);
    try {
      const res = await fetch("/api/v1/org/install-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode: system.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Not signed in / no active org → fall back to the org picker.
        router.push(`/select-org?system=${system.id}`);
        return;
      }
      router.push(data?.data?.redirectTo ?? "/my-apps");
    } catch {
      router.push(`/select-org?system=${system.id}`);
    } finally {
      setRequesting(false);
    }
  };

  const inner = (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all group-hover:bg-primary/20 group-hover:scale-105">
          <Icon className="h-6 w-6" />
        </div>
        <StatusBadge status={system.status} />
      </div>
      <h3 className="text-base font-bold leading-snug text-white">{system.nameAr}</h3>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/55">
        {system.descAr}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
          {cat && <IconOf name={cat.icon} className="h-3.5 w-3.5" />}
          {cat?.titleAr ?? ""}
        </span>
        {available ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-transform group-hover:-translate-x-0.5">
            {requesting ? "جارٍ الإرسال…" : actionLabel}
            <ArrowLeft className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-white/35">
            <Clock className="h-3.5 w-3.5" />
            قريباً
          </span>
        )}
      </div>
    </div>
  );

  const cardCls =
    "group block h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-xl hover:shadow-primary/[0.06]";

  if (available) {
    if (signInOnSelect) {
      // Signed-in user + system backed by a real catalog app → request approval.
      if (session?.user && requestable) {
        return (
          <button
            type="button"
            onClick={requestSystem}
            disabled={requesting}
            aria-busy={requesting}
            className={`${cardCls} w-full text-start disabled:cursor-wait`}
          >
            {inner}
          </button>
        );
      }

      return (
        <Link href={selectHref} className={cardCls}>
          {inner}
        </Link>
      );
    }

    return (
      <a
        href={system.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cardCls}
      >
        {inner}
      </a>
    );
  }

  return (
    <div className="group block h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      {inner}
    </div>
  );
}

function IconOf({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? ICONS.box;
  return <C className={className} />;
}

export function SystemsMarketplace({
  actionLabel = "تجربة النظام",
  signInOnSelect = false,
}: {
  actionLabel?: string;
  signInOnSelect?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [sortOpen, setSortOpen] = useState(false);

  const availableCount = useMemo(
    () => SYSTEMS.filter((s) => s.status === "available" && s.href).length,
    [],
  );

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches: BusinessSystem[] = [];
    for (const s of SYSTEMS) {
      if (activeCat !== "all" && s.category !== activeCat) continue;
      if (normalized) {
        const cat = CATEGORY_MAP[s.category];
        const haystack = [
          s.nameAr,
          s.nameEn,
          s.descAr,
          s.descEn,
          cat?.titleAr ?? "",
          cat?.titleEn ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalized)) continue;
      }
      matches.push(s);
    }

    const buckets = new Map<string, BusinessSystem[]>();
    for (const s of matches) {
      const list = buckets.get(s.category) ?? [];
      list.push(s);
      buckets.set(s.category, list);
    }

    const order = activeCat === "all" ? CATEGORIES : CATEGORIES.filter((c) => c.id === activeCat);
    const result: { cat: SystemCategory; items: BusinessSystem[] }[] = [];
    for (const cat of order) {
      const items = buckets.get(cat.id);
      if (items && items.length > 0) {
        result.push({ cat, items: sortSystems(items, sort) });
      }
    }
    return result;
  }, [query, activeCat, sort]);

  const totalShown = groups.reduce((sum, g) => sum + g.items.length, 0);
  const currentSort = SORTS.find((s) => s.key === sort) ?? SORTS[0];

  return (
    <div className="animate-fade-in-up">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 end-4 h-5 w-5 -translate-y-1/2 text-white/35" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن نظام بالاسم أو المجال…"
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 pe-12 ps-4 text-sm text-white outline-none backdrop-blur-xl transition-all placeholder:text-white/30 focus:border-primary/50 focus:bg-white/[0.05]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="مسح البحث"
              className="absolute top-1/2 end-11 -translate-y-1/2 rounded-full p-1 text-white/40 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className="inline-flex w-full items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-sm font-medium text-white/70 backdrop-blur-xl transition-all hover:border-primary/30 hover:text-white sm:w-auto"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{currentSort.label}</span>
            <svg
              className={`h-4 w-4 text-white/40 transition-transform ${sortOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="absolute end-0 z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0b1c]/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-2xl">
                {SORTS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSort(opt.key);
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center rounded-xl px-3 py-2.5 text-start text-sm transition-colors ${
                      sort === opt.key
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-white/70 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
        <button
          type="button"
          onClick={() => setActiveCat("all")}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
            activeCat === "all"
              ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
              : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          كل الأنظمة
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCat(c.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              activeCat === c.id
                ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
                : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
            }`}
          >
            <IconOf name={c.icon} className="h-4 w-4" />
            {c.titleAr}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/40">
        <span>
          يعرض <span className="font-semibold text-white/70">{totalShown}</span> نظاماً
          من أصل <span className="font-semibold text-white/70">{SYSTEMS.length}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="font-semibold text-primary">{availableCount}</span> نظام متاح للتجربة الفورية
        </span>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-white/[0.06] bg-white/[0.02] px-6 py-16 text-center backdrop-blur-xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Search className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-white">لا توجد نتائج مطابقة</h3>
          <p className="mt-2 max-w-sm text-sm text-white/50">
            جرّب كلمات بحث أخرى أو اختر فئة مختلفة من الأعلى.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveCat("all");
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary/20"
          >
            عرض كل الأنظمة
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          {groups.map(({ cat, items }) => (
            <section key={cat.id} aria-label={cat.titleAr}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-[#0263D1]/15 text-primary">
                    <IconOf name={cat.icon} className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-white">{cat.titleAr}</h2>
                    <p className="text-xs text-white/45">{cat.descAr}</p>
                  </div>
                </div>
                <span className="mt-1 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-white/45">
                  {items.length} نظام
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((s) => (
                  <SystemCard key={s.id} system={s} actionLabel={actionLabel} signInOnSelect={signInOnSelect} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-14 flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-primary/[0.07] to-[#0263D1]/[0.05] px-6 py-10 text-center backdrop-blur-xl">
        <h2 className="text-xl font-extrabold text-white sm:text-2xl">لم تجد نظامك المناسب؟</h2>
        <p className="max-w-xl text-sm text-white/55">
          أنشئ حسابك وابدأ بأي نظام Business OS مباشرة، أو تواصل معنا لطلب نظام مخصص لعملك.
        </p>
        <a
          href="/signup"
          className="group mt-2 inline-flex items-center gap-2.5 rounded-2xl bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:brightness-110 active:scale-[0.98]"
        >
          إنشاء حساب مجاناً
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1 rtl:rotate-180" />
        </a>
      </div>
    </div>
  );
}