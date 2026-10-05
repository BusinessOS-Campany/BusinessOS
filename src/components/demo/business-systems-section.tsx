"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  LayoutGrid,
  Loader2,
  Search,
  SearchX,
  X,
} from "lucide-react";
import {
  BUSINESS_SYSTEMS,
  CATEGORY_MAP,
  SYSTEM_CATEGORIES,
  type BusinessSystem,
  type SystemStatus,
} from "@/core/demo/business-systems-data";
import { revealDelay, spotlightFromEvent, useScrollReveal } from "@/components/demo/use-scroll-reveal";

type SortKey = "recommended" | "az" | "za" | "category" | "available" | "coming";

const SORT_OPTIONS: { value: SortKey; labelAr: string; labelEn: string }[] = [
  { value: "recommended", labelAr: "موصى به", labelEn: "Recommended" },
  { value: "az", labelAr: "أ – ي", labelEn: "A–Z" },
  { value: "za", labelAr: "ي – أ", labelEn: "Z–A" },
  { value: "category", labelAr: "حسب الفئة", labelEn: "Category" },
  { value: "available", labelAr: "المتاح أولاً", labelEn: "Available first" },
  { value: "coming", labelAr: "القادم أولاً", labelEn: "Coming first" },
];

const STATUS_META: Record<SystemStatus, { labelAr: string; live: boolean }> = {
  available: { labelAr: "متاح الآن", live: true },
  coming_soon: { labelAr: "قريباً", live: false },
};

/** Arabic-tolerant normalization so search matches with/without hamza/diacritics. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

function matches(system: BusinessSystem, query: string): boolean {
  if (!query) return true;
  const category = CATEGORY_MAP.get(system.category);
  const haystack = normalize(
    [system.nameAr, system.nameEn, system.descAr, system.descEn, system.keywords, category?.nameAr ?? "", category?.nameEn ?? ""].join(" "),
  );
  return query.split(/\s+/).every((token) => haystack.includes(token));
}

function sortSystems(systems: BusinessSystem[], sort: SortKey): BusinessSystem[] {
  const rank = (s: BusinessSystem) => (s.status === "available" ? 0 : 1);
  const byName = (a: BusinessSystem, b: BusinessSystem) => a.nameAr.localeCompare(b.nameAr, "ar");
  const byCategory = (a: BusinessSystem, b: BusinessSystem) => {
    const order = SYSTEM_CATEGORIES.findIndex((c) => c.id === a.category) - SYSTEM_CATEGORIES.findIndex((c) => c.id === b.category);
    return order !== 0 ? order : byName(a, b);
  };
  const copy = [...systems];
  switch (sort) {
    case "az": return copy.sort(byName);
    case "za": return copy.sort((a, b) => byName(b, a));
    case "category": return copy.sort(byCategory);
    case "available": return copy.sort((a, b) => rank(a) - rank(b) || byName(a, b));
    case "coming": return copy.sort((a, b) => rank(b) - rank(a) || byName(a, b));
    default: return copy.sort((a, b) => rank(a) - rank(b));
  }
}

/**
 * What a card offers the visitor who is already signed in with an org.
 *
 * `installable` is the only state that files a request, and it is decided
 * server-side from what the deployment can actually serve (see
 * `installableCardIds`). A card with no entry is not installable and keeps
 * rendering as the ordinary coming-soon card, which is why the catalog can list
 * 173 systems without the page promising 173 installs.
 */
export type SystemCardState =
  | { state: "installable" }
  | { state: "pending" }
  | { state: "installed"; route: string | null };

/**
 * /demo and /systems render this exact component so the cards, toolbar, search
 * and category pills are literally the same code. The only thing that differs is
 * what a card does when clicked: on /demo an available system opens its live
 * route, whereas on /systems a card the deployment can actually serve files a
 * platform-approval request. Everything visual is shared, so the two pages can
 * never drift apart.
 */
export function BusinessSystemsSection({ states }: {
  /**
   * Per-card state, keyed by `BUSINESS_SYSTEMS[].id`. Empty/absent renders every
   * card as a coming-soon showcase, which is what /demo and every signed-out
   * visitor get: there is no organization to request a system for.
   *
   * A plain record rather than a Map: this crosses the server/client boundary as
   * a serialized prop, and the page awaits it, so there is no value in paying
   * for a collection type the wire format cannot carry.
   */
  states?: Readonly<Record<string, SystemCardState>>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  // A card that was just requested flips to "pending" here, so the badge updates
  // without a round trip that would lose the visitor's scroll and filters.
const [requested, setRequested] = useState<Record<string, SystemCardState>>({});
  const cardState = useCallback((id: string) => requested[id] ?? states?.[id], [requested, states]);
  const revealRef = useScrollReveal<HTMLElement>();
  const toolbarRef = useRef<HTMLDivElement>(null);

  /* The toolbar is sticky, so it has to clear the shell header, which is also
     `sticky top-0`. Measured rather than hard-coded: the header is shorter on
     mobile, and this degrades to 0 if the header is ever not sticky, which
     would otherwise leave a gap the cards scroll through. */
  useEffect(() => {
    const el = toolbarRef.current;
    const header = document.querySelector("header");
    if (!el || !header) return;
    const apply = () => {
      const pos = getComputedStyle(header).position;
      const h = pos === "sticky" || pos === "fixed" ? header.offsetHeight : 0;
      el.style.setProperty("--toolbar-top", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    const ro = new ResizeObserver(apply);
    ro.observe(header);
    return () => {
      window.removeEventListener("resize", apply);
      ro.disconnect();
    };
  }, []);

  const normalizedQuery = useMemo(() => normalize(query), [query]);

  const filtered = useMemo(() => {
    const inCategory = category === "all" ? BUSINESS_SYSTEMS : BUSINESS_SYSTEMS.filter((s) => s.category === category);
    return sortSystems(inCategory.filter((s) => matches(s, normalizedQuery)), sort);
  }, [category, normalizedQuery, sort]);

  const grouped = useMemo(() => {
    if (normalizedQuery || category !== "all" || (sort !== "recommended" && sort !== "category")) return null;
    return SYSTEM_CATEGORIES.map((c) => ({
      category: c,
      systems: sortSystems(BUSINESS_SYSTEMS.filter((s) => s.category === c.id), sort),
    }));
  }, [normalizedQuery, category, sort]);

  const reset = () => {
    setQuery("");
    setCategory("all");
    setSort("recommended");
  };

  return (
    <section
      ref={revealRef}
      aria-label="حلول الأعمال"
      className="mt-14"
      onPointerMove={spotlightFromEvent}
    >
      {/* No sub-header here: the page hero above now carries the catalog
          lead-in as one merged text, so this section opens straight on search. */}
      {/* Search + category filter, pinned. Full-bleed (negative margins cancel
          the page container's own padding) so cards scroll *under* the glass
          instead of past its edges. */}
      <div
        ref={toolbarRef}
        className="sticky z-30 -mx-4 mt-6 border-b border-white/[0.06] bg-[#050510]/85 px-4 pt-1 backdrop-blur-2xl sm:-mx-6 sm:px-6"
        style={{ top: "var(--toolbar-top, 0px)" }}
      >
      {/* Search */}
      <div className="mx-auto max-w-2xl">
        <label htmlFor="business-systems-search" className="sr-only">ابحث عن الأنظمة</label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
          <input
            id="business-systems-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن الأنظمة… جرّب: طبي، مطعم، محاسبة، medical"
            autoComplete="off"
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 pe-11 ps-12 text-sm text-white placeholder:text-white/35 backdrop-blur-xl transition-all outline-none focus:border-primary/60 focus:bg-primary/[0.06] focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="مسح البحث"
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category filter pills. Left full-bleed on purpose: 20 categories need
          the whole container width to stay a mostly-horizontal strip. */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="تصفية حسب الفئة">
        <FilterPill active={category === "all"} onClick={() => setCategory("all")} icon={<LayoutGrid className="h-4 w-4" />} label="الكل" count={BUSINESS_SYSTEMS.length} />
        {SYSTEM_CATEGORIES.map((c) => (
          <FilterPill
            key={c.id}
            active={category === c.id}
            onClick={() => setCategory(category === c.id ? "all" : c.id)}
            icon={<c.icon className="h-4 w-4" />}
            label={c.nameAr}
            count={BUSINESS_SYSTEMS.filter((s) => s.category === c.id).length}
          />
        ))}
      </div>
      </div>

      {/* Sort + result count */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50" role="status">
          {/* Re-keyed so the count cross-fades whenever the result set changes. */}
          <span key={`${filtered.length}-${category}-${sort}`} className="inline-block animate-fade-in">
            {filtered.length === 0 ? "لا توجد نتائج مطابقة" : `عرض ${filtered.length} من ${BUSINESS_SYSTEMS.length} نظاماً`}
          </span>
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-white/60">
          ترتيب:
          <span className="relative inline-flex items-center">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="ترتيب الأنظمة"
              className="appearance-none rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pe-9 ps-3 text-sm text-white backdrop-blur-xl outline-none transition-all focus:border-primary/60 [&>option]:bg-[#0b0b1e]"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.labelAr}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-white/40" />
          </span>
        </label>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.03] px-6 py-14 text-center backdrop-blur-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SearchX className="h-7 w-7" />
          </div>
          <p className="text-lg font-bold text-white">لا توجد أنظمة مطابقة لبحثك</p>
          <p className="text-sm text-white/50">جرّب كلمة مختلفة أو تصفح جميع الفئات.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-xl border border-primary/50 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-white"
          >
            عرض كل الأنظمة
          </button>
        </div>
      ) : grouped ? (
        grouped.map(({ category: c, systems }) => (
          <div key={c.id} className="mt-12">
            <div data-reveal className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-white">
                  {c.nameAr}
                  <span className="ms-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-semibold text-white/60">{systems.length}</span>
                </h3>
                <p className="text-sm text-white/50">{c.descAr} <span dir="ltr" className="text-white/35">· {c.nameEn}</span></p>
                <span className="demo-underline mt-2 opacity-70" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {systems.map((s, i) => (
                <BusinessSystemCard
                  key={s.id}
                  system={s}
                  index={i}
                  installState={cardState(s.id)}
                  onRequested={(next) => setRequested((prev) => ({ ...prev, [s.id]: next }))}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s, i) => (
            <BusinessSystemCard
              key={s.id}
              system={s}
              index={i}
              showCategory
              installState={cardState(s.id)}
              onRequested={(next) => setRequested((prev) => ({ ...prev, [s.id]: next }))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterPill({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap backdrop-blur-xl transition-all focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none ${
        active
          ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
          : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
      }`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-1.5 text-xs ${active ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/40"}`}>{count}</span>
    </button>
  );
}

/**
 * Files the platform-approval request for one system.
 *
 * This is the same endpoint `/apps` and `/{org}/my-apps` post to, so all three
 * pages share one code path: idempotent, reopens a previously rejected request,
 * and writes the audit log. It never installs instantly — an admin approves at
 * `/platform-admin/approvals`, which is what creates the `organizationApp` row
 * the profile's systems tab then reads.
 */
async function requestSystem(slug: string): Promise<SystemCardState> {
  const res = await fetch(`/api/v1/apps/${encodeURIComponent(slug)}/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json?.error?.messageAr as string | undefined) ?? "REQUEST_FAILED");
  const state = json?.data?.state as string | undefined;
  if (state === "installed") {
    return { state: "installed", route: (json?.data?.route as string | undefined) ?? null };
  }
  // Anything else the API can answer with here is a queued request: a demo opens
  // instantly with no install row, and a real system lands in the approval queue.
  return { state: "pending" };
}

function BusinessSystemCard({
  system,
  showCategory = false,
  index = 0,
  installState,
  onRequested,
}: {
  system: BusinessSystem;
  showCategory?: boolean;
  index?: number;
  /** Undefined on /demo and for every card this deployment cannot serve. */
  installState?: SystemCardState;
  onRequested?: (next: SystemCardState) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // An installable card is live regardless of the curated catalog's own status:
  // the roadmap marks almost everything "coming soon", but this one the platform
  // confirmed it can serve and approve.
  const installable = installState?.state === "installable";
  const meta = installable ? STATUS_META.available : STATUS_META[system.status];
  const category = CATEGORY_MAP.get(system.category);
  const actionLabel = system.status === "available" ? "افتح النظام" : "ابدأ نسختك";

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const next = await requestSystem(system.id);
      onRequested?.(next);
      // Already installed (another tab, or a repeat click): go straight there.
      // A queued request stays put so the visitor sees the badge that says so.
      if (next.state === "installed" && next.route) router.push(next.route);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  /** Footer badge + label for the state, so every branch reads the same. */
  const action = (() => {
    if (busy) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ إرسال الطلب…
        </span>
      );
    }
    if (failed) {
      return <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-300">تعذّر إرسال الطلب</span>;
    }
    switch (installState?.state) {
      case "installed":
        return (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
            <Check className="h-4 w-4" />
            افتح النظام
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300">
            <Clock className="h-4 w-4" />
            بانتظار الموافقة
          </span>
        );
      case "installable":
        return (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            ثبّت الآن
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1 rtl:rotate-180" />
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            {system.status === "available" ? "استكشف" : "قريباً"}
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1 rtl:rotate-180" />
          </span>
        );
    }
  })();

  const inner = (
    <>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
          <system.icon className="h-6 w-6" />
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            installState?.state === "installed"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : installState?.state === "pending"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : meta.live
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/10 bg-white/[0.04] text-white/45"
          }`}
        >
          {installState?.state === "installed" ? (
            "مثبّت"
          ) : installState?.state === "pending" ? (
            "قيد الموافقة"
          ) : (
            <>
              {meta.live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              {meta.labelAr}
            </>
          )}
        </span>
      </div>
      <h4 className="text-base leading-snug font-bold text-white">{system.nameAr}</h4>
      <p dir="ltr" className="mt-0.5 truncate text-right text-xs text-white/35">{system.nameEn}</p>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-white/60">{system.descAr}</p>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/55">
          {showCategory ? category?.nameAr : actionLabel}
        </span>
        {action}
      </div>
    </>
  );

  // `w-full` is on the shared class so a <button> card fills its grid cell the
  // same way an <a> does; without it the two wrappers would not match.
  const className =
    "demo-card group flex w-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-start backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-xl hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none active:scale-[0.99]";

  // Scroll reveal is armed by the shared observer in use-scroll-reveal; the
  // stagger is per grid position so a row cascades instead of popping at once.
  const motion = {
    "data-reveal": "",
    "data-spotlight": "",
    style: { "--reveal-delay": revealDelay(index) } as CSSProperties,
  };

  // Installed opens the org's own copy, which is served under the org.
  if (installState?.state === "installed") {
    return installState.route ? (
      <Link
        href={installState.route}
        aria-label={`${system.nameAr} — مثبّت، افتح النظام`}
        className={className}
        {...motion}
      >
        {inner}
      </Link>
    ) : (
      <div aria-label={`${system.nameAr} — مثبّت`} className={className} {...motion}>
        {inner}
      </div>
    );
  }

  if (installable) {
    return (
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        aria-label={`${system.nameAr} — ثبّت النظام`}
        aria-busy={busy}
        className={`${className} disabled:cursor-progress disabled:opacity-70`}
        {...motion}
      >
        {inner}
      </button>
    );
  }

  return system.status === "available" && system.route ? (
    <a href={system.route} target="_blank" rel="noopener noreferrer" aria-label={`${system.nameAr} — افتح النظام`} className={className} {...motion}>
      {inner}
    </a>
  ) : (
    <Link href="/signup" aria-label={`${system.nameAr} — ${meta.labelAr}، ابدأ نسختك`} className={className} {...motion}>
      {inner}
    </Link>
  );
}
