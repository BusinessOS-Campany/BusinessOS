"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Search,
  Store,
  FlaskConical,
  Power,
  PowerOff,
} from "lucide-react";
import type { CatalogEntry } from "@/core/apps/service";
import type { Dictionary, Locale } from "@/core/i18n/dictionaries";

type AppDraft = {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  image: string;
  schemaKey: string;
  category: string;
  version: string;
  routePrefix: string;
  isActive: boolean;
  status: "active" | "in-maintenance" | "deprecated";
};

const EMPTY_DRAFT: AppDraft = {
  slug: "",
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
  icon: "box",
  image: "",
  schemaKey: "",
  category: "",
  version: "1.0.0",
  routePrefix: "/",
  isActive: true,
  status: "active",
};

async function api(path: string, method: string, body?: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, message: json?.error?.messageAr ?? json?.error?.messageEn ?? "خطأ غير متوقع" };
  } catch {
    return { ok: false, message: "تعذر الاتصال بالخادم" };
  }
}

export function SystemsManager({
  dict,
  locale,
  apps,
}: {
  dict: Dictionary;
  locale: Locale;
  apps: CatalogEntry[];
}) {
  const [items, setItems] = useState<CatalogEntry[]>(apps);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [draft, setDraft] = useState<AppDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const app of items) set.add(app.category);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((app) => {
      if (category !== "all" && app.category !== category) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        (app.nameAr?.toLowerCase().includes(q) ?? false) ||
        app.slug.toLowerCase().includes(q)
      );
    });
  }, [items, query, category]);

  function langName(app: CatalogEntry) {
    return locale === "ar" && app.nameAr ? app.nameAr : app.name;
  }

  function flash(msg: string | null, ms = 2500) {
    setToast(msg);
    if (msg) setTimeout(() => setToast(null), ms);
  }

  function open(draft: AppDraft | null) {
    setDraft(draft);
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    // Optional metadata: omit blanks so zod optional() accepts the payload.
    const { image, schemaKey, ...rest } = draft;
    const payload = {
      ...rest,
      ...(image.trim() ? { image: image.trim() } : {}),
      ...(schemaKey.trim() ? { schemaKey: schemaKey.trim() } : {}),
    };
    const res = await api("/api/platform/apps", "POST", payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? dict.platform.systems.error);
      return;
    }
    // Re-fetch the catalog so counters reflect reality.
    const list = await fetch("/api/platform/apps", { cache: "no-store" }).then((r) => r.json().catch(() => null));
    if (list?.data?.apps) setItems(list.data.apps);
    open(null);
    flash(dict.platform.systems.saved);
  }

  async function toggle(app: CatalogEntry, isActive: boolean) {
    setBusy(true);
    const res = await api(`/api/platform/apps/${app.slug}`, "PATCH", { isActive });
    setBusy(false);
    if (res.ok) {
      setItems((prev) => prev.map((a) => (a.id === app.id ? { ...a, isActive } : a)));
      flash(isActive ? dict.platform.systems.active : dict.platform.systems.inactive);
    } else {
      flash(res.message ?? dict.platform.systems.error);
    }
  }

  async function remove(app: CatalogEntry) {
    if (!dict.platform.systems.deleteConfirm && !window.confirm(dict.platform.systems.deleteConfirm)) return;
    setBusy(true);
    const res = await api(`/api/platform/apps/${app.slug}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      setItems((prev) => prev.filter((a) => a.id !== app.id));
      flash(dict.platform.systems.deleted);
    } else {
      flash(res.message ?? dict.platform.systems.inUse);
    }
  }

  const statusLabel = (s: string | null) => {
    if (s === "active") return dict.platform.systems.active;
    if (s === "in-maintenance") return dict.platform.systems.inMaintenance;
    if (s === "deprecated") return dict.platform.systems.deprecated;
    return s ?? "—";
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dict.platform.systems.search}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 ps-9 pe-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-primary/50 focus:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-primary/50 focus:outline-none"
        >
          <option value="all">{dict.platform.systems.allCategories}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => open(EMPTY_DRAFT)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {dict.platform.systems.add}
        </button>
      </div>

      {toast && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          {toast}
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-12 text-center text-sm text-neutral-500">
          {dict.platform.systems.empty}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-900 text-start text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-start">{dict.platform.systems.name}</th>
                <th className="hidden px-4 py-3 text-start md:table-cell">{dict.platform.systems.category}</th>
                <th className="hidden px-4 py-3 text-start lg:table-cell">{dict.platform.systems.type}</th>
                <th className="px-4 py-3 text-start">{dict.platform.systems.status}</th>
                <th className="hidden px-4 py-3 text-start lg:table-cell">{dict.platform.systems.installs}</th>
                <th className="px-4 py-3 text-end">{dict.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app) => {
                // Server-classified: a browser cannot read the deployment's
                // `system/` listing, so recomputing here mislabels every
                // cloneable per-org system as a demo.
                const kind = app.kind;
                return (
                  <tr key={app.id} className="border-b border-neutral-800/70 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {kind === "demo" ? <FlaskConical className="h-4.5 w-4.5" /> : <Store className="h-4.5 w-4.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-100">{langName(app)}</p>
                          <p className="truncate text-xs text-neutral-500">{app.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-neutral-400 md:table-cell">{app.category}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span
                        className={
                          kind === "demo"
                            ? "rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300"
                            : "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
                        }
                      >
                        {kind === "demo" ? dict.platform.systems.demo : dict.platform.systems.real}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggle(app, !app.isActive)}
                          disabled={busy}
                          title={
                            app.isActive
                              ? dict.platform.systems.inactive
                              : dict.platform.systems.active
                          }
                          className={
                            app.isActive
                              ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
                              : "inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300"
                          }
                        >
                          {app.isActive ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                          {statusLabel(app.isActive ? app.status : null) ?? (app.isActive ? dict.platform.systems.active : dict.platform.systems.inactive)}
                        </button>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-neutral-400 lg:table-cell">
                      <div className="space-y-0.5 text-xs">
                        <p>
                          {app.installCount} {dict.platform.systems.installs}
                        </p>
                        {app.requestCount > 0 && (
                          <p className="text-amber-400">
                            {app.requestCount} {dict.platform.systems.pendingCount}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" dir="ltr">
                        {app.route && (
                          <a
                            href={app.route}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white"
                            title={dict.platform.systems.open}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            open({
                              slug: app.slug,
                              name: app.name,
                              nameAr: app.nameAr ?? "",
                              description: app.description ?? "",
                              descriptionAr: app.descriptionAr ?? "",
                              icon: app.icon ?? "box",
                              image: app.image ?? "",
                              schemaKey: app.schemaKey ?? "",
                              category: app.category,
                              version: app.version ?? "1.0.0",
                              routePrefix: app.routePrefix ?? "/",
                              isActive: app.isActive,
                              status: (app.status as AppDraft["status"]) ?? "active",
                            })
                          }
                          className="rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white"
                          title={dict.platform.systems.edit}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(app)}
                          className="rounded-md p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                          title={dict.platform.systems.delete}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit modal */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-base font-semibold">
              {draft.slug && items.some((a) => a.slug === draft.slug)
                ? dict.platform.systems.edit
                : dict.platform.systems.add}
            </h2>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={dict.platform.systems.slug}>
                <input
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  disabled={items.some((a) => a.slug === draft.slug)}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none disabled:opacity-50"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.version}>
                <input
                  value={draft.version}
                  onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.name}>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.nameAr}>
                <input
                  value={draft.nameAr}
                  onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="rtl"
                />
              </Field>
              <Field label={dict.platform.systems.desc}>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.descAr}>
                <textarea
                  value={draft.descriptionAr}
                  onChange={(e) => setDraft({ ...draft, descriptionAr: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="rtl"
                />
              </Field>
              <Field label={dict.platform.systems.icon}>
                <input
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.category}>
                <input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.image}>
                <input
                  value={draft.image}
                  onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.schemaKey}>
                <input
                  value={draft.schemaKey}
                  onChange={(e) => setDraft({ ...draft, schemaKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.routePrefix}>
                <input
                  value={draft.routePrefix}
                  onChange={(e) => setDraft({ ...draft, routePrefix: e.target.value })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                  dir="ltr"
                />
              </Field>
              <Field label={dict.platform.systems.status}>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as AppDraft["status"] })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
                >
                  <option value="active">{dict.platform.systems.active}</option>
                  <option value="in-maintenance">{dict.platform.systems.inMaintenance}</option>
                  <option value="deprecated">{dict.platform.systems.deprecated}</option>
                </select>
              </Field>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 accent-emerald-500"
              />
              {dict.platform.systems.active}
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => open(null)}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
              >
                {dict.platform.systems.cancel}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {dict.platform.systems.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-400">{label}</span>
      {children}
    </label>
  );
}