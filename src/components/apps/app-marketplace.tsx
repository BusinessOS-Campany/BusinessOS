"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  CheckCheck,
  Coffee,
  Eye,
  FlaskConical,
  Hourglass,
  Hospital,
  Loader2,
  Microscope,
  Pill,
  Search,
  SearchX,
  ShoppingCart,
  Smile,
  Star,
  Store,
  Clock,
  X,
  type LucideIcon,
} from "lucide-react";
import type { MarketplaceEntry } from "@/core/apps/service";
import { CATEGORY_MAP } from "@/core/demo/systems-catalog";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import { revealDelay, spotlightFromEvent, useScrollReveal } from "@/components/demo/use-scroll-reveal";

// Two legacy rows predate the curated catalog and carry category ids it does
// not define (grocery -> "business", sama-center -> "healthcare"). They are
// stable enough to alias here; anything else falls back to the raw id rather
// than inventing a title nobody asked for.
const LEGACY_CATEGORY_NAMES: Record<string, { ar: string; en: string }> = {
  business: { ar: "الأعمال", en: "Business" },
  healthcare: { ar: "المراكز الصحية", en: "Health Centers" },
};

const ICONS: Record<string, LucideIcon> = {
  store: Store,
  smile: Smile,
  hospital: Hospital,
  pill: Pill,
  microscope: Microscope,
  eye: Eye,
  coffee: Coffee,
  cart: ShoppingCart,
  box: Box,
};

const RECENTS_KEY = "bos_systems_recent";

// A stable empty array. Returning a fresh `[]` from a snapshot getter makes
// React think the store changed on every render.
const NO_RECENTS: string[] = [];

// `useSyncExternalStore` needs three things: a subscribe function, a client
// snapshot getter, and a server snapshot getter. The third is the point -
// during SSR and hydration React is handed NO_RECENTS, so the markup matches,
// and only after hydration does it re-render with whatever is in localStorage.
let cachedRecents: string[] | null = null;
const recentsSubscribers = new Set<() => void>();

function readRecents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function getRecentsSnapshot(): string[] {
  if (typeof window === "undefined") return NO_RECENTS;
  // Cached: getSnapshot must be referentially stable between renders or React
  // reports the store as perpetually changing.
  if (cachedRecents === null) cachedRecents = readRecents();
  return cachedRecents;
}

function getServerRecentsSnapshot(): string[] {
  return NO_RECENTS;
}

function subscribeRecents(onChange: () => void): () => void {
  recentsSubscribers.add(onChange);
  // Another tab writing the same key should update this one too.
  window.addEventListener("storage", onChange);
  return () => {
    recentsSubscribers.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeRecents(next: string[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* Private mode or a full quota: the strip is a convenience, not state that
       has to survive, so a failed write is not worth breaking the click for. */
  }
  cachedRecents = next;
  for (const notify of recentsSubscribers) notify();
}

/**
 * Records a system as recently opened, most recent first, capped at four.
 *
 * Module scope: it touches only module state and `localStorage`, and making it
 * stable is what lets the "preparing" poll below depend on it without restarting
 * on every render of the catalog.
 */
function trackOpen(slug: string): void {
  const next = [slug, ...readRecents().filter((s) => s !== slug)].slice(0, 4);
  writeRecents(next);
}

async function requestSystem(
  slug: string,
): Promise<{ ok: boolean; state?: string; route?: string | null; message?: string }> {
  try {
    const res = await fetch(`/api/v1/apps/${slug}/request`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, state: json?.data?.state, route: json?.data?.route ?? null };
    return { ok: false, message: json?.error?.messageAr ?? json?.error?.messageEn };
  } catch {
    return { ok: false, message: "CONNECTION_FAILED" };
  }
}

/**
 * Whether an org's own copy of a system is runnable yet.
 *
 * An install hands the org a folder of source; the production build that turns it
 * into an app runs on first open and takes minutes. Rather than send the customer
 * to a page that will sit blank for two minutes, the card asks this and waits.
 */
async function pollInstall(slug: string): Promise<{ ok: boolean; state?: string; route?: string | null; error?: string | null }> {
  try {
    const res = await fetch(`/api/v1/apps/${slug}/install`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    return { ok: true, state: json?.data?.state, route: json?.data?.route ?? null, error: json?.data?.error ?? null };
  } catch {
    return { ok: false };
  }
}

async function toggleFavorite(slug: string, fav: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/v1/marketplace/favorites/${slug}`, {
      method: fav ? "PUT" : "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Waits for an org's copy of a system to finish building, then opens it.
 *
 * Module scope on purpose: it is a long-running poll that must not be torn down
 * and restarted by a re-render, so it takes the three things it needs as
 * arguments instead of closing over component state. The component wires them in
 * from an effect keyed on the SET of preparing slugs, so updating a card's state
 * does not restart the wait for the cards that are still waiting.
 *
 * The build is the first open's job and takes minutes, so this polls rather than
 * navigating into a page that would sit blank. The interval grows because a
 * multi-minute build is normal and a fixed fast poll would be a request storm
 * against a server that is busy compiling. It stops for good on any terminal
 * answer — built, gone, or unreachable — and never loops forever.
 */
async function awaitReady(
  slug: string,
  onState: (slug: string, state: MarketplaceEntry["state"], route: string | null) => void,
  onToast: (text: string, ok: boolean) => void,
  onReady: (route: string) => void,
  messages: { ready: string; timeout: string; failed: string },
): Promise<void> {
  const deadline = Date.now() + 20 * 60_000;
  let delay = 2000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 15_000);

    const res = await pollInstall(slug);
    if (!res.ok) {
      // The org lost the system, or the platform is unreachable. Stop asking and
      // let a reload tell the truth; a spinner that never resolves is worse than
      // an honest stale card.
      onState(slug, "installed", null);
      return;
    }
    if (res.state === "installed") {
      onState(slug, "installed", res.route ?? null);
      onToast(messages.ready, true);
      if (res.route) onReady(res.route);
      return;
    }
    if (res.state === "failed") {
      // The warm build was attempted at install time and failed. Stop waiting
      // and say so; a spinner that never resolves hides the real problem.
      onState(slug, "unavailable", null);
      onToast(messages.failed, false);
      return;
    }
  }
  // Still building after twenty minutes. Leave the card as it is; the build is
  // logged in the org's own provisioning log, and the next open will finish it.
  onToast(messages.timeout, false);
}

export function AppMarketplace({
  initialApps,
  dict,
  locale,
}: {
  initialApps: MarketplaceEntry[];
  dict: Dictionary;
  locale: Locale;
}) {
  const d = (key: string) => t(dict, `platform.marketplace.${key}`);
  const router = useRouter();
  const [apps, setApps] = useState<MarketplaceEntry[]>(initialApps);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [installedOnly, setInstalledOnly] = useState(false);
  // Read through useSyncExternalStore rather than a state initializer or an
  // effect: `localStorage` does not exist on the server, so a lazy initializer
  // renders no "recently opened" chips into the SSR HTML and then renders them
  // on the client's first paint - a hydration mismatch that React reports as
  // "server rendered HTML didn't match the client" and repairs by throwing the
  // whole tree away.
  //
  // It was latent while this grid lived only on /apps, but `/{org}/my-apps` now
  // renders the same component and is where a returning customer lands, so it
  // became reachable on the first page a signed-in user sees.
  const recents = useSyncExternalStore(subscribeRecents, getRecentsSnapshot, getServerRecentsSnapshot);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // The demo-page motion stack, shared verbatim: one IntersectionObserver arms
  // the scroll reveal for the whole grid and one delegated pointermove drives
  // every card's cursor spotlight, so 198 cards cost one observer and one
  // handler each instead of one per card.
  const revealRef = useScrollReveal<HTMLElement>();
  const toolbarRef = useRef<HTMLDivElement>(null);

  // The toolbar is sticky, so it has to clear the shell header, which is also
  // `sticky top-0`. Measured rather than hard-coded: the header is shorter on
  // mobile, and this degrades to 0 if the header is ever not sticky, which
  // would otherwise leave a gap the cards scroll through.
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

  const STATE_LABEL: Record<string, { text: string; cls: string }> = {
    installed: { text: d("stateInstalled"), cls: "bg-emerald-500/15 text-emerald-300" },
    // Owned and being made ready — a different thing from "waiting for a human",
    // and from "installed", which would promise an app that cannot open yet.
    preparing: { text: d("statePreparing"), cls: "bg-sky-500/15 text-sky-300" },
    pending: { text: d("statePending"), cls: "bg-amber-500/15 text-amber-300" },
    demo: { text: d("stateDemo"), cls: "bg-sky-500/15 text-sky-300" },
    installable: { text: d("stateInstallable"), cls: "bg-white/[0.06] text-white/60" },
    unavailable: { text: d("stateUnavailable"), cls: "bg-neutral-700/30 text-neutral-500" },
    // A promise, not a switch-off: distinct from "unavailable" on purpose.
    soon: { text: d("stateSoon"), cls: "bg-indigo-500/15 text-indigo-300" },
  };

  // app.category is a raw English id. Most resolve through the curated
  // catalog's CATEGORY_MAP; the two pre-catalog legacy rows are aliased above;
  // anything else shows itself rather than a guessed title.
  const categoryName = useCallback(
    (id: string): string => {
      const catalog = CATEGORY_MAP[id];
      if (catalog) return locale === "ar" ? catalog.titleAr : catalog.titleEn;
      const legacy = LEGACY_CATEGORY_NAMES[id];
      return locale === "ar" ? (legacy?.ar ?? id) : (legacy?.en ?? id);
    },
    [locale],
  );

  const categories = useMemo(() => {
    // Unique by raw id (the filter state uses the raw id), ordered for the
    // reader's script: Arabic collation sorts "الأعمال" beside "الض...", which
    // an English-id sort never would.
    const seen = new Set<string>();
    for (const app of apps) if (app.category) seen.add(app.category);
    return Array.from(seen).sort((a, b) =>
      categoryName(a).localeCompare(categoryName(b), locale === "ar" ? "ar" : "en"),
    );
  }, [apps, categoryName, locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (favoritesOnly && !app.isFavorite) return false;
      // The catalog is far larger than what a tenant owns, so "mine" needs to be
      // one click rather than a scroll through every coming-soon card.
      if (installedOnly && app.state !== "installed") return false;
      if (category !== "all" && app.category !== category) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        (app.nameAr?.toLowerCase().includes(q) ?? false) ||
        (app.description?.toLowerCase().includes(q) ?? false) ||
        (app.descriptionAr?.toLowerCase().includes(q) ?? false) ||
        app.slug.toLowerCase().includes(q)
      );
    });
  }, [apps, query, category, favoritesOnly, installedOnly]);

  /**
   * The systems still being waited on, as one string.
   *
   * A string rather than the array so the effect below re-runs only when the SET
   * changes. Depending on the cards themselves would restart every in-flight poll
   * on every state update — and the poll updates the cards — so nothing would
   * ever finish building.
   */
  const preparingKey = useMemo(
    () => apps.filter((a) => a.state === "preparing").map((a) => a.slug).sort().join(","),
    [apps],
  );

  /**
   * A card can arrive already `preparing` — the customer installed, closed the tab
   * while the build ran, and came back — so the wait has to be able to start from
   * a server-rendered state and not only from a click. `waited` keeps one poll per
   * system, and the toast travels as a dictionary KEY rather than resolved text so
   * this effect needs no dependency on the dictionary and cannot restart when the
   * locale changes mid-build.
   */
  const waited = useRef(new Set<string>());

  const flash = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2600);
  }, []);

  // The two strings the poll can ever show, resolved once per locale so the poll
  // effect below does not depend on the dictionary helper.
  const prepareMessages = useMemo(
    () => ({ ready: d("readyFlash"), timeout: d("preparingTimeout"), failed: d("preparingFailed") }),
    // `d` is `(key) => t(dict, prefix + key)`; it is stable for a given `dict`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dict, locale],
  );

  useEffect(() => {
    const pending = preparingKey ? preparingKey.split(",") : [];
    for (const slug of pending) {
      if (waited.current.has(slug)) continue;
      waited.current.add(slug);
      void awaitReady(
        slug,
        (target, state, route) =>
          setApps((prev) =>
            prev.map((a) => (a.slug === target ? { ...a, state, route: route ?? a.route } : a)),
          ),
        flash,
        (route) => {
          trackOpen(slug);
          router.push(route);
        },
        prepareMessages,
      ).finally(() => waited.current.delete(slug));
    }
  }, [preparingKey, router, flash, prepareMessages]);

  function displayName(app: MarketplaceEntry) {
    return locale === "ar" ? (app.nameAr ?? app.name) : app.name;
  }

  function displayDescription(app: MarketplaceEntry) {
    return locale === "ar" ? (app.descriptionAr ?? app.description) : (app.description ?? app.descriptionAr);
  }

  async function setup(app: MarketplaceEntry) {
    setBusySlug(app.slug);
    const res = await requestSystem(app.slug);
    setBusySlug(null);
    if (!res.ok) {
      flash(res.message === "CONNECTION_FAILED" ? d("connectionFailed") : (res.message ?? d("requestFailed")), false);
      return;
    }
    // Self-service: installed systems open immediately (redirect to dashboard).
    if ((res.state === "installed" || res.state === "demo") && res.route) {
      setApps((prev) =>
        prev.map((a) =>
          a.slug === app.slug ? { ...a, state: res.state as MarketplaceEntry["state"], route: res.route ?? null } : a,
        ),
      );
      trackOpen(app.slug);
      flash(d("installedFlash"));
      setTimeout(() => {
        router.push(res.route as string);
      }, 700);
      return;
    }
    // The org has its own copy of the code, but the copy still has to be built
    // before it can be opened. Poll instead of navigating, and open for them the
    // moment it is ready.
    if (res.state === "preparing") {
      setApps((prev) =>
        prev.map((a) => (a.slug === app.slug ? { ...a, state: "preparing", route: res.route ?? null } : a)),
      );
      flash(d("preparingFlash"));
      return;
    }
    // Legacy pending rows (pre-self-service requests) still surface as pending.
    setApps((prev) =>
      prev.map((a) =>
        a.slug === app.slug ? { ...a, state: (res.state ?? "pending") as MarketplaceEntry["state"] } : a,
      ),
    );
    flash(d("pendingFlash"));
  }

  async function toggleFav(app: MarketplaceEntry) {
    const target = !app.isFavorite;
    setApps((prev) => prev.map((a) => (a.slug === app.slug ? { ...a, isFavorite: target } : a)));
    const ok = await toggleFavorite(app.slug, target);
    if (!ok) {
      setApps((prev) => prev.map((a) => (a.slug === app.slug ? { ...a, isFavorite: app.isFavorite } : a)));
      flash(d("favFailed"), false);
    }
  }

  return (
    <section ref={revealRef} onPointerMove={spotlightFromEvent} className="space-y-6">
      {/* Filter bar, pinned below the shell header the same way /demo pins its
          search: cards scroll *under* the glass instead of past its edges. */}
      <div
        ref={toolbarRef}
        className="sticky z-30 border-b border-white/[0.06] bg-[#050510]/85 pb-2.5 pt-3 backdrop-blur-2xl"
        style={{ top: "var(--toolbar-top, 0px)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={d("searchPlaceholder")}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 ps-9 pe-9 text-sm text-white placeholder:text-white/40 backdrop-blur-xl transition-all outline-none focus:border-primary/60 focus:bg-primary/[0.06] focus:ring-2 focus:ring-primary/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={d("clearSearch")}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ToggleChip
            active={favoritesOnly}
            onClick={() => setFavoritesOnly((v) => !v)}
            icon={<Star className="h-4 w-4" />}
            label={d("favorites")}
            activeCls="border-amber-400/40 bg-amber-400/10 text-amber-300 shadow-lg shadow-amber-500/10"
          />
          <ToggleChip
            active={installedOnly}
            onClick={() => setInstalledOnly((v) => !v)}
            icon={<CheckCheck className="h-4 w-4" />}
            label={d("installedOnly")}
            activeCls="border-emerald-400/40 bg-emerald-400/10 text-emerald-300 shadow-lg shadow-emerald-500/10"
            aria-pressed={installedOnly}
          />
        </div>
        {/* Category pills. Same semantics as the filter this replaces, in the
            /demo look: a strip that scrolls on narrow screens. */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={d("categoryFilter")}>
          <CategoryPill active={category === "all"} onClick={() => setCategory("all")} label={d("allCategories")} count={apps.length} />
          {categories.map((c) => (
            <CategoryPill
              key={c}
              active={category === c}
              onClick={() => setCategory(category === c ? "all" : c)}
              label={categoryName(c)}
            />
          ))}
        </div>
      </div>

      {toast && (
        <div
          className={
            toast.ok
              ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300"
              : "rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
          }
        >
          {toast.text}
        </div>
      )}

      {/* Recently opened */}
      {recents.length > 0 && !favoritesOnly && (
        <div>
          <p className="mb-2 text-xs text-white/50">{d("recentTitle")}</p>
          <div className="flex flex-wrap gap-2">
            {recents.map((slug) => {
              const app = apps.find((a) => a.slug === slug);
              if (!app?.route) return null;
              return (
                <Link
                  key={slug}
                  href={app.route}
                  onClick={() => trackOpen(slug)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-primary/40 hover:text-white"
                >
                  <Clock className="h-3.5 w-3.5" />
                  {displayName(app)}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.03] px-6 py-14 text-center backdrop-blur-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SearchX className="h-7 w-7" />
          </div>
          <p className="text-base font-bold text-white">{d("empty")}</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
              setFavoritesOnly(false);
              setInstalledOnly(false);
            }}
            className="mt-2 rounded-xl border border-primary/50 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-white"
          >
            {d("showAll")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app, i) => {
            const Icon = ICONS[app.icon ?? ""] ?? Box;
            // The server already classified this row. Recomputing it here would
            // need the deployment's `system/` listing, which a browser cannot
            // read — so the badge would claim "demo" for a system the marketplace
            // had correctly resolved as a per-org real install.
            const kind = app.kind;
            const label = STATE_LABEL[app.state];
            return (
              <div
                key={app.id}
                data-reveal
                data-spotlight
                style={{ "--reveal-delay": revealDelay(i) } as CSSProperties}
                className="demo-card group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-xl hover:shadow-primary/10 active:scale-[0.99]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary to-primary/60 opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="flex items-start justify-between">
                  {app.image ? (
                    <img src={app.image} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                      <Icon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        kind === "demo"
                          ? "inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300"
                          : "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300"
                      }
                    >
                      {kind === "demo" ? <FlaskConical className="h-3 w-3" /> : null}
                      {kind === "demo" ? d("kindDemo") : d("kindPlatform")}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${label.cls}`}>{label.text}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFav(app)}
                  className={
                    app.isFavorite
                      ? "absolute end-3 top-3 z-10 rounded-full p-1 text-amber-400 hover:bg-white/10"
                      : "absolute end-3 top-3 z-10 rounded-full p-1 text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  }
                  title={app.isFavorite ? d("favRemove") : d("favAdd")}
                >
                  <Star className={`h-4 w-4 ${app.isFavorite ? "fill-amber-400" : ""}`} />
                </button>

                <h3 className="mt-4 text-lg font-bold text-white">{displayName(app)}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60 line-clamp-3">
                  {displayDescription(app)}
                </p>

                <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
                  <span className="text-xs text-white/40">
                    {categoryName(app.category)} · {app.version ?? ""}
                  </span>

                  {app.state === "installed" && app.route ? (
                    <Link
                      href={app.route}
                      onClick={() => trackOpen(app.slug)}
                      className="demo-sheen inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90"
                    >
                      {d("open")} <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                    </Link>
                  ) : app.state === "preparing" ? (
                    // Installed, but the org's own copy is still being built. There
                    // is nothing to click yet, and offering a link would send them
                    // to a page that sits blank until the build finishes.
                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm text-white/50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {d("preparing")}
                    </span>
                  ) : app.state === "demo" && app.route ? (
                    <Link
                      href={app.route}
                      onClick={() => trackOpen(app.slug)}
                      className="demo-sheen inline-flex items-center gap-1 rounded-lg bg-sky-500/20 px-3 py-1.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/30"
                    >
                      {d("tryNow")} <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                    </Link>
                  ) : app.state === "installable" ? (
                    <button
                      type="button"
                      onClick={() => setup(app)}
                      disabled={busySlug === app.slug}
                      className="demo-sheen inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {busySlug === app.slug ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {d("installing")}
                        </>
                      ) : (
                        <>
                          {d("addSystem")} <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm text-white/40">
                      {app.state === "pending" && <Clock className="h-3.5 w-3.5" />}
                      {app.state === "soon" && <Hourglass className="h-3.5 w-3.5" />}
                      {app.state === "pending" ? d("pendingWait") : label.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Compact toggle used for the favorites / installed-only filters. */
function ToggleChip({
  active,
  onClick,
  icon,
  label,
  activeCls,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeCls: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium backdrop-blur-xl transition-all ${
        active ? activeCls : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
      }`}
      {...rest}
    >
      {icon}
      {label}
    </button>
  );
}

/** Category filter pill, matching the /demo catalog strip. */
function CategoryPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap backdrop-blur-xl transition-all ${
        active
          ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
          : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-primary/30 hover:text-white"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 text-xs ${active ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/40"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
