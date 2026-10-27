"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  History,
  KeyRound,
  Loader2,
  RefreshCw,
  Unplug,
  Plug,
  RotateCcw,
  Upload,
  X,
  ExternalLink,
} from "lucide-react";
import type { Dictionary } from "@/core/i18n/dictionaries";

type Installation = {
  id: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
  suspended: boolean;
};

type Deployment = {
  id: string;
  status: string;
  commitSha: string;
  commitMessage?: string | null;
  ref?: string;
  trigger: string;
  isActive: boolean;
  error: string | null;
  queuedAt: string;
  finishedAt: string | null;
};

type SystemRow = {
  slug: string;
  repoFullName: string;
  branch: string;
  accountLogin: string;
  category: string;
  framework: string | null;
  packageManager: string;
  archived: boolean;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastSyncedAt: string | null;
  installedOrgs: number;
  contractMissing: string[];
  latestDeployment: Deployment | null;
};

type Dashboard = {
  configured: boolean;
  missingEnv: string[];
  installUrl: string | null;
  org: string | null;
  installations: Installation[];
  systems: SystemRow[];
};

type Repo = {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
};

type Branch = { name: string; sha: string };

type EnvVar = { key: string; isSecret: boolean; updatedAt: string };

async function request<T>(path: string, method = "GET", body?: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(path, {
      method,
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { data: (json?.data ?? json) as T };
    const message =
      json?.error?.messageAr ?? json?.error?.messageEn ?? json?.error?.message ?? `HTTP ${res.status}`;
    return { error: message };
  } catch {
    return { error: "تعذر الاتصال بالخادم" };
  }
}

const FRAMEWORK_LABEL: Record<string, string> = {
  next: "Next.js",
  vite: "Vite",
  node: "Node",
  unknown: "?",
};

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "—";
}

export function GithubSystemsSection({ dict }: { dict: Dictionary }) {
  const g = dict.platform.systems.github;
  const [payload, setPayload] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [envSlug, setEnvSlug] = useState<string | null>(null);
  const [deploySlug, setDeploySlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await request<Dashboard>("/api/platform/github");
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError(null);
    setPayload(res.data ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await request<Dashboard>("/api/platform/github");
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setPayload(res.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function flash(msg: string | null, ms = 3000) {
    setToast(msg);
    if (msg) setTimeout(() => setToast(null), ms);
  }

  async function sync() {
    setBusy("sync");
    const res = await request<Dashboard>("/api/platform/github", "POST");
    setBusy(null);
    if (res.error) {
      flash(res.error);
      return;
    }
    setPayload(res.data ?? payload);
    flash(g.connected);
  }

  async function patchSystem(slug: string, patch: Record<string, unknown>, flag: string) {
    setBusy(`${flag}:${slug}`);
    const res = await request(`/api/platform/github/systems/${slug}`, "PATCH", patch);
    setBusy(null);
    if (res.error) {
      flash(res.error);
      return;
    }
    await load();
  }

  async function disconnect(system: SystemRow) {
    if (!window.confirm(g.confirmDisconnect)) return;
    setBusy(`disconnect:${system.slug}`);
    const res = await request(`/api/platform/github/systems/${system.slug}`, "PATCH", { archived: true });
    setBusy(null);
    if (res.error) {
      flash(res.error);
      return;
    }
    await load();
  }

  const statusLabel = useCallback(
    (status: string) => {
      const map: Record<string, string> = {
        queued: g.statusQueued,
        fetching: g.statusFetching,
        installing: g.statusInstalling,
        building: g.statusBuilding,
        deploying: g.statusDeploying,
        active: g.statusActive,
        failed: g.statusFailed,
      };
      return map[status] ?? status;
    },
    [g],
  );

  const statusTone = (status: string) => {
    if (status === "active") return "bg-emerald-500/15 text-emerald-300";
    if (status === "failed") return "bg-red-500/15 text-red-300";
    return "bg-sky-500/15 text-sky-300";
  };

  const systems = payload?.systems ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-neutral-200">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{g.title}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-neutral-400">{g.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payload?.configured && payload.installUrl && (
            <a
              href={payload.installUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-white/5"
            >
              <GitBranch className="h-4 w-4" />
              {g.connect}
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </a>
          )}
          <button
            type="button"
            onClick={sync}
            disabled={busy === "sync" || !payload?.configured}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-50"
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {busy === "sync" ? g.syncing : g.sync}
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            disabled={!payload?.configured || (payload?.installations.length ?? 0) === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {g.import}
          </button>
        </div>
      </div>

      {!payload?.configured && !loading && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {g.notConfigured}
          </p>
          {payload?.missingEnv && payload.missingEnv.length > 0 && (
            <p className="mt-1 text-amber-200/80" dir="ltr">
              {g.missingEnv} {payload.missingEnv.join(", ")}
            </p>
          )}
          <p className="mt-1 text-amber-200/70">{g.setupHint}</p>
        </div>
      )}

      {toast && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 px-2 py-8 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {g.loading}
        </div>
      ) : systems.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-10 text-center">
          <p className="text-sm text-neutral-400">{g.empty}</p>
          <p className="mt-1 text-xs text-neutral-500">{g.emptyHint}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-900 text-start text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-start">{g.repo}</th>
                <th className="hidden px-4 py-3 text-start md:table-cell">{g.branch}</th>
                <th className="hidden px-4 py-3 text-start lg:table-cell">{g.commit}</th>
                <th className="px-4 py-3 text-start">{g.contract}</th>
                <th className="hidden px-4 py-3 text-start lg:table-cell">{g.deploys}</th>
                <th className="px-4 py-3 text-end">{dict.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((system) => {
                const ready = system.contractMissing.length === 0;
                const dep = system.latestDeployment;
                return (
                  <tr
                    key={system.slug}
                    className="border-b border-neutral-800/70 last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-100" dir="ltr">
                          {system.repoFullName}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                          <span dir="ltr">{system.slug}</span>
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">
                            {FRAMEWORK_LABEL[system.framework ?? "unknown"] ?? "?"}
                          </span>
                          {system.archived && (
                            <span className="rounded bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-300">
                              {g.disconnect}
                            </span>
                          )}
                        </p>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-neutral-400 md:table-cell" dir="ltr">
                      {system.branch}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="space-y-0.5">
                        <p className="font-mono text-xs text-neutral-300" dir="ltr">
                          {shortSha(system.lastCommitSha)}
                        </p>
                        {system.lastCommitMessage && (
                          <p className="max-w-56 truncate text-xs text-neutral-500" dir="ltr">
                            {system.lastCommitMessage}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ready ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          {g.ready}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"
                          title={`${g.missingContract} ${system.contractMissing.join(", ")}`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {g.needsUpdate}
                        </span>
                      )}
                      {system.installedOrgs > 0 && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {system.installedOrgs} {g.orgs}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {dep ? (
                        <div className="space-y-0.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusTone(dep.status)}`}>
                            {statusLabel(dep.status)}
                          </span>
                          <p className="font-mono text-[11px] text-neutral-500" dir="ltr">
                            {shortSha(dep.commitSha)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-600">{g.statusNone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" dir="ltr">
                        <button
                          type="button"
                          onClick={() => setDeploySlug(system.slug)}
                          title={g.history}
                          className="rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => patchSystem(system.slug, { refresh: true }, "refresh")}
                          disabled={busy === `refresh:${system.slug}`}
                          title={g.refresh}
                          className="rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white disabled:opacity-50"
                        >
                          {busy === `refresh:${system.slug}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnvSlug(system.slug)}
                          title={g.env}
                          className="rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {system.archived ? (
                          <button
                            type="button"
                            onClick={() => patchSystem(system.slug, { archived: false }, "reconnect")}
                            disabled={busy === `reconnect:${system.slug}`}
                            title={g.reconnect}
                            className="rounded-md p-2 text-neutral-500 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
                          >
                            <Plug className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => disconnect(system)}
                            disabled={busy === `disconnect:${system.slug}`}
                            title={g.disconnect}
                            className="rounded-md p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          >
                            <Unplug className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importOpen && (
        <ImportDialog
          dict={dict}
          installations={payload?.installations ?? []}
          onClose={() => setImportOpen(false)}
          onImported={async (result) => {
            setImportOpen(false);
            await load();
            if (result.missing.length === 0) flash(`${g.imported}: ${result.slug}`);
            else flash(`${g.imported}: ${result.slug} — ${g.missingContract} ${result.missing.join(", ")}`, 5000);
          }}
        />
      )}

      {envSlug && <EnvDialog dict={dict} slug={envSlug} onClose={() => setEnvSlug(null)} />}

      {deploySlug && (
        <DeploymentsDialog
          dict={dict}
          slug={deploySlug}
          onClose={() => setDeploySlug(null)}
          onQueued={async () => {
            setDeploySlug(null);
            await load();
            flash(g.rollbackQueued);
          }}
        />
      )}
    </section>
  );
}

function ImportDialog({
  dict,
  installations,
  onClose,
  onImported,
}: {
  dict: Dictionary;
  installations: Installation[];
  onClose: () => void;
  onImported: (result: { slug: string; missing: string[] }) => void;
}) {
  const g = dict.platform.systems.github;
  const [installationId, setInstallationId] = useState<number>(installations[0]?.id ?? 0);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoFullName, setRepoFullName] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [repoMeta, setRepoMeta] = useState<Repo | null>(null);
  const [loadingRepos, setLoadingRepos] = useState<boolean>((installations[0]?.id ?? 0) > 0);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    description: "",
    descriptionAr: "",
    icon: "box",
    category: "business",
    slug: "",
  });

  useEffect(() => {
    if (!installationId) return;
    let cancelled = false;
    (async () => {
      const res = await request<{ repos: Repo[] }>(
        `/api/platform/github/repos?installationId=${installationId}`,
      );
      if (cancelled) return;
      setLoadingRepos(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setRepos(res.data?.repos ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  function chooseInstallation(id: number) {
    setInstallationId(id);
    setLoadingRepos(true);
    setRepos([]);
    setRepoFullName("");
    setBranches([]);
    setBranch("");
    setRepoMeta(null);
  }

  const selectedRepo = useMemo(
    () => repoMeta ?? repos.find((r) => r.fullName === repoFullName) ?? null,
    [repoMeta, repos, repoFullName],
  );

  async function chooseRepo(fullName: string) {
    setRepoFullName(fullName);
    setBranches([]);
    setBranch("");
    setRepoMeta(null);
    if (!fullName) return;
    const repo = repos.find((r) => r.fullName === fullName);
    if (repo) {
      setRepoMeta(repo);
      setForm((f) => ({
        ...f,
        name: f.name || repo.name,
        description: f.description || repo.description || "",
        slug: f.slug,
      }));
    }
    setLoadingBranches(true);
    const res = await request<{ repo: Repo; branches: Branch[] }>(
      `/api/platform/github/repos?installationId=${installationId}&repo=${encodeURIComponent(fullName)}`,
    );
    setLoadingBranches(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setBranches(res.data?.branches ?? []);
    setBranch(res.data?.repo?.defaultBranch ?? res.data?.branches?.[0]?.name ?? "");
  }

  async function submit() {
    setError(null);
    if (!installationId || !repoFullName || !branch || !form.name.trim() || !form.description.trim()) {
      setError("missing");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      installationId,
      repoFullName,
      branch,
      name: form.name.trim(),
      description: form.description.trim(),
      icon: form.icon.trim() || "box",
      category: form.category.trim() || "business",
    };
    if (form.nameAr.trim()) payload.nameAr = form.nameAr.trim();
    if (form.descriptionAr.trim()) payload.descriptionAr = form.descriptionAr.trim();
    if (form.slug.trim()) payload.slug = form.slug.trim();
    const res = await request<{ system: { slug: string; missing: string[] } }>(
      "/api/platform/github/import",
      "POST",
      payload,
    );
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onImported(res.data!.system);
  }

  const input =
    "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{g.importTitle}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error === "missing" ? dict.platform.systems.error : error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={g.selectInstallation}>
            <select value={installationId} onChange={(e) => chooseInstallation(Number(e.target.value))} className={input}>
              {installations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.accountLogin}
                </option>
              ))}
            </select>
          </Field>
          <Field label={g.selectRepo}>
            <select
              value={repoFullName}
              onChange={(e) => void chooseRepo(e.target.value)}
              disabled={loadingRepos}
              className={input}
            >
              <option value="">{loadingRepos ? g.loading : "—"}</option>
              {repos.map((r) => (
                <option key={r.id} value={r.fullName}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={g.selectBranch}>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={loadingBranches || branches.length === 0}
              className={input}
            >
              <option value="">{loadingBranches ? g.loading : "—"}</option>
              {branches.map((b) => (
                <option key={b.sha} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={dict.platform.systems.slug}>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              placeholder={selectedRepo?.name}
              dir="ltr"
              className={input}
            />
          </Field>
          <Field label={dict.platform.systems.name}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="ltr" className={input} />
          </Field>
          <Field label={dict.platform.systems.nameAr}>
            <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} dir="rtl" className={input} />
          </Field>
          <Field label={dict.platform.systems.desc}>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              dir="ltr"
              className={input}
            />
          </Field>
          <Field label={dict.platform.systems.descAr}>
            <textarea
              value={form.descriptionAr}
              onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
              rows={2}
              dir="rtl"
              className={input}
            />
          </Field>
          <Field label={dict.platform.systems.icon}>
            <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} dir="ltr" className={input} />
          </Field>
          <Field label={dict.platform.systems.category}>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              dir="ltr"
              className={input}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
          >
            {dict.platform.systems.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? g.importing : g.import}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnvDialog({ dict, slug, onClose }: { dict: Dictionary; slug: string; onClose: () => void }) {
  const g = dict.platform.systems.github;
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(true);

  useEffect(() => {
    void request<{ envVars: EnvVar[] }>(`/api/platform/github/systems/${slug}/env`).then((res) => {
      setLoading(false);
      if (!res.error && res.data) setVars(res.data.envVars ?? []);
    });
  }, [slug]);

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    const res = await request<{ envVars: EnvVar[] }>(`/api/platform/github/systems/${slug}/env`, "POST", {
      key: key.trim(),
      value,
      isSecret,
    });
    setBusy(false);
    if (res.error) return;
    setVars(res.data?.envVars ?? []);
    setKey("");
    setValue("");
  }

  async function remove(k: string) {
    setBusy(true);
    const res = await request<{ envVars: EnvVar[] }>(`/api/platform/github/systems/${slug}/env`, "DELETE", { key: k });
    setBusy(false);
    if (res.error) return;
    setVars(res.data?.envVars ?? []);
  }

  const input =
    "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">{g.envTitle}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500" dir="ltr">
          {slug}
        </p>
        <p className="mb-4 text-xs text-amber-300/80">{g.envHint}</p>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {g.loading}
          </div>
        ) : vars.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-500">{g.envEmpty}</p>
        ) : (
          <ul className="mb-4 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {vars.map((v) => (
              <li key={v.key} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-neutral-200" dir="ltr">
                    {v.key}
                  </span>
                  {v.isSecret && <KeyRound className="h-3 w-3 text-neutral-500" />}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(v.key)}
                  disabled={busy}
                  className="rounded-md p-1 text-neutral-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={g.envKey}>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              dir="ltr"
              className={input}
            />
          </Field>
          <Field label={g.envValue}>
            <input value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" className={input} type={isSecret ? "password" : "text"} />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(e) => setIsSecret(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 accent-emerald-500"
          />
          {g.envSecret}
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
          >
            {g.close}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !key.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {g.envAdd}
          </button>
        </div>
      </div>
    </div>
  );
}

const IN_FLIGHT_STATUSES = new Set(["queued", "fetching", "installing", "building", "deploying", "activating"]);

function DeploymentsDialog({
  dict,
  slug,
  onClose,
  onQueued,
}: {
  dict: Dictionary;
  slug: string;
  onClose: () => void;
  onQueued: () => void;
}) {
  const g = dict.platform.systems.github;
  const [rows, setRows] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySha, setBusySha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerLabel = useCallback(
    (trigger: string) => {
      const map: Record<string, string> = {
        push: g.triggerPush,
        webhook: g.triggerWebhook,
        manual: g.triggerManual,
        redeploy: g.triggerRedeploy,
        rollback: g.triggerRollback,
      };
      return map[trigger] ?? trigger;
    },
    [g],
  );

  const statusLabel = useCallback(
    (status: string) => {
      const map: Record<string, string> = {
        queued: g.statusQueued,
        fetching: g.statusFetching,
        installing: g.statusInstalling,
        building: g.statusBuilding,
        deploying: g.statusDeploying,
        active: g.statusActive,
        failed: g.statusFailed,
      };
      return map[status] ?? status;
    },
    [g],
  );

  useEffect(() => {
    let cancelled = false;
    void request<{ deployments: Deployment[] }>(`/api/platform/github/systems/${slug}/deployments`).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setRows(res.data?.deployments ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function rollback(sha: string) {
    if (!window.confirm(g.confirmRollback)) return;
    setError(null);
    setBusySha(sha);
    const res = await request(`/api/platform/github/systems/${slug}/deployments`, "POST", { commitSha: sha });
    setBusySha(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    onQueued();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">{g.rollbackTitle}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500" dir="ltr">
          {slug}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {g.loading}
          </div>
        ) : rows.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-500">{g.noDeployments}</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {rows.map((row) => {
              const inFlight = IN_FLIGHT_STATUSES.has(row.status);
              const canRollBack = !row.isActive && !inFlight;
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-neutral-200">
                      <span className="font-mono text-xs" dir="ltr">
                        {shortSha(row.commitSha)}
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
                        {triggerLabel(row.trigger)}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                        row.status === "active" ? "bg-emerald-500/15 text-emerald-300" : row.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-sky-500/15 text-sky-300"
                      }`}>
                        {statusLabel(row.status)}
                      </span>
                      {row.isActive && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">{g.current}</span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      {row.commitMessage && (
                        <span className="max-w-64 truncate" dir="ltr">
                          {row.commitMessage}
                        </span>
                      )}
                      <span className="text-neutral-600">{new Date(row.queuedAt).toLocaleString()}</span>
                    </p>
                  </div>
                  {canRollBack && (
                    <button
                      type="button"
                      onClick={() => void rollback(row.commitSha)}
                      disabled={busySha === row.commitSha}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-50"
                    >
                      {busySha === row.commitSha && <Loader2 className="h-3 w-3 animate-spin" />}
                      <RotateCcw className="h-3 w-3" />
                      {g.rollback}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
          >
            {g.close}
          </button>
        </div>
      </div>
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
