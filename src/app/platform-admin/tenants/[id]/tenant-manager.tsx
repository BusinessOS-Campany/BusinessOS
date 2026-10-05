"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Dictionary } from "@/core/i18n/dictionaries";

interface Member {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  isPlatformAdmin: boolean;
}
interface AppRow {
  appId: string;
  slug: string;
  name: string;
  status: string;
  icon: string;
}
interface AppOption {
  slug: string;
  name: string;
}
interface PlanOption {
  code: string;
  label: string;
}

interface InitialData {
  status: string;
  planCode: string;
  grantedApps: AppRow[];
  availableApps: AppOption[];
  plans: PlanOption[];
  members: Member[];
  domains: string[];
  subdomain: string;
  baseDomain: string;
  pendingCount: number;
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { messageEn?: string; messageAr?: string };
  };
  if (!res.ok) throw new Error(json.error?.messageAr ?? json.error?.messageEn ?? `Request failed (${res.status})`);
}

const btn = "rounded-md border border-neutral-700 px-2 py-1 text-xs hover:text-white disabled:opacity-50";

export function TenantsDetailManager({
  tenantId,
  dict,
  initial,
}: {
  tenantId: string;
  dict: Dictionary;
  initial: InitialData;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [planCode, setPlanCode] = useState(initial.planCode);
  const [grantedApps, setGrantedApps] = useState<AppRow[]>(initial.grantedApps);
  const [filter, setFilter] = useState("");
  const [domains, setDomains] = useState<string[]>(initial.domains);
  const [newDomain, setNewDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function setMemberRole(member: Member, role: string) {
    await call(`/api/platform/tenants/${tenantId}/members/${member.memberId}`, "PATCH", { role });
  }

  async function removeMember(member: Member) {
    if (!confirm(`${t(dict, "common.delete")} ${member.email}?`)) return;
    await call(`/api/platform/tenants/${tenantId}/members/${member.memberId}`, "DELETE");
  }

  async function toggleApp(appSlug: string) {
    const existing = grantedApps.find((a) => a.slug === appSlug);
    if (existing && existing.status === "active") {
      const row = grantedApps.find((a) => a.slug === appSlug);
      if (!row) return;
      if (!row.appId) {
        router.refresh();
        return;
      }
      await call(`/api/platform/tenants/${tenantId}/apps/${row.appId}`, "DELETE");
      setGrantedApps((prev) =>
        prev.map((a) => (a.slug === appSlug ? { ...a, status: "disabled" } : a)),
      );
    } else {
      await call(`/api/platform/tenants/${tenantId}/apps`, "POST", { appSlug });
      const meta = initial.availableApps.find((a) => a.slug === appSlug);
      setGrantedApps((prev) => [
        { appId: "", slug: appSlug, name: meta?.name ?? appSlug, status: "active", icon: "📦" },
        ...prev.filter((a) => a.slug !== appSlug),
      ]);
    }
  }

  async function changePlan() {
    await call(`/api/platform/tenants/${tenantId}`, "PATCH", { planCode });
  }

  async function toggleSuspension() {
    const next = status === "active" ? "suspended" : "active";
    await call(`/api/platform/tenants/${tenantId}`, "PATCH", { status: next });
    setStatus(next);
  }

  async function addDomain() {
    const domain = newDomain.trim();
    if (!domain) return;
    await call(`/api/platform/tenants/${tenantId}/domains`, "POST", { domain });
    setDomains((prev) => (prev.includes(domain) ? prev : [...prev, domain]));
    setNewDomain("");
  }

  async function removeDomain(domain: string) {
    if (!confirm(`${t(dict, "platform.tenantDetail.domainsRemove")} ${domain}?`)) return;
    await call(`/api/platform/tenants/${tenantId}/domains`, "DELETE", { domain });
    setDomains((prev) => prev.filter((d) => d !== domain));
  }

  async function impersonate(userId: string) {
    await call(`/api/platform/users/${userId}/impersonate`, "POST");
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  const filtered = filter
    ? initial.members.filter(
        (m) => m.name.toLowerCase().includes(filter.toLowerCase()) || m.email.toLowerCase().includes(filter.toLowerCase()),
      )
    : initial.members;

  const installedSlugs = new Set(grantedApps.filter((a) => a.status === "active").map((a) => a.slug));

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl border border-red-900/60 bg-red-950 px-4 py-2 text-sm text-red-300">{error}</p>}

      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="text-sm text-neutral-400">
          Tenant status
          <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${status === "active" ? "bg-primary/10 text-primary" : "bg-red-900/60 text-red-300"}`}>
            {status}
          </span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-primary"
          >
            {initial.plans.map((p) => (
              <option key={p.code} value={p.code}>{p.label} ({p.code})</option>
            ))}
          </select>
          <button disabled={busy || planCode === initial.planCode} className={btn} onClick={() => void run(changePlan)}>
            {t(dict, "platform.tenantDetail.changePlan")}
          </button>
          {status === "pending" ? (
            <span className="text-xs text-amber-300">
              {t(dict, "platform.tenantDetail.pendingApprovalHint")}
            </span>
          ) : (
            <button disabled={busy} className={btn} onClick={() => void run(toggleSuspension)}>
              {status === "active"
                ? t(dict, "platform.tenantDetail.suspendTenant")
                : t(dict, "platform.tenantDetail.reactivateTenant")}
            </button>
          )}
        </div>
      </div>

      {/* Apps */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 font-medium">{t(dict, "platform.tenantDetail.applications")}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {initial.availableApps.map((app) => {
            const row = grantedApps.find((a) => a.slug === app.slug);
            const active = installedSlugs.has(app.slug);
            return (
              <div key={app.slug} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                <span className="text-xl">{row?.icon ?? "📦"}</span>
                <span className="flex-1 text-sm">{app.name}</span>
                <span className={`text-xs ${active ? "text-primary" : "text-neutral-500"}`}>
                  {active
                    ? t(dict, "platform.tenantDetail.granted")
                    : row?.status === "disabled"
                      ? t(dict, "platform.tenantDetail.revoked")
                      : "—"}
                </span>
                <button
                  disabled={busy}
                  className={btn}
                  onClick={() => void run(() => toggleApp(app.slug))}
                >
                  {active
                    ? t(dict, "platform.tenantDetail.revoke")
                    : t(dict, "platform.tenantDetail.grant")}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Domains */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 font-medium">{t(dict, "platform.tenantDetail.domains")}</h2>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">{t(dict, "platform.tenantDetail.domainsSubdomainLabel")}</span>
          <a
            href={`https://${initial.subdomain}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-xs text-primary hover:border-neutral-500"
          >
            {initial.subdomain}
          </a>
        </div>

        <div className="space-y-2">
          {domains.length === 0 && (
            <p className="text-sm text-neutral-500">{t(dict, "platform.tenantDetail.domainsEmpty")}</p>
          )}
          {domains.map((domain) => (
            <div key={domain} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
              <span className="flex-1 font-mono text-sm">{domain}</span>
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                {t(dict, "platform.tenantDetail.domainsOpen")}
              </a>
              <button disabled={busy} className={`${btn} text-red-300`} onClick={() => void run(() => removeDomain(domain))}>
                {t(dict, "platform.tenantDetail.domainsRemove")}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder={t(dict, "platform.tenantDetail.domainsAddPlaceholder")}
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-primary"
            dir="ltr"
          />
          <button
            disabled={busy || !newDomain.trim()}
            className={btn}
            onClick={() => void run(addDomain)}
          >
            {t(dict, "platform.tenantDetail.domainsAdd")}
          </button>
        </div>

        <p className="mt-3 text-xs text-neutral-500">{t(dict, "platform.tenantDetail.domainsHint")}</p>
      </section>

      {/* Accounts */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">
            {t(dict, "platform.tenantDetail.accountsLabel")} ({initial.members.length})
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t(dict, "platform.tenantDetail.filterByEmail")}
            className="w-56 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">{t(dict, "platform.overview.name")}</th>
                <th className="px-3 py-2 font-medium">{t(dict, "common.email")}</th>
                <th className="px-3 py-2 font-medium">{t(dict, "common.role")}</th>
                <th className="px-3 py-2 font-medium">{t(dict, "platform.tenants.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filtered.map((m) => (
                <tr key={m.memberId}>
                  <td className="px-3 py-2">
                    {m.name}
                    {m.isPlatformAdmin && (
                      <span className="ms-2 text-xs text-amber-300">{t(dict, "platform.tenantDetail.platform")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-400">{m.email}</td>
                  <td className="px-3 py-2">
                    <select
                      disabled={busy || m.role === "owner"}
                      defaultValue={m.role}
                      onChange={(e) => void run(() => setMemberRole(m, e.target.value))}
                      className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-50"
                    >
                      {(Object.keys(dict.platform.tenantDetail.roles) as Array<keyof typeof dict.platform.tenantDetail.roles>).map((value) => (
                        <option key={String(value)} value={String(value)}>
                          {dict.platform.tenantDetail.roles[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <button disabled={busy} className={btn} onClick={() => void run(() => impersonate(m.userId))}>
                        {t(dict, "platform.tenants.impersonate")}
                      </button>
                      {m.role !== "owner" && (
                        <button
                          disabled={busy}
                          className={`${btn} text-red-300`}
                          onClick={() => void run(() => removeMember(m))}
                        >
                          {t(dict, "platform.tenantDetail.remove")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {initial.members.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-500">{t(dict, "platform.tenantDetail.noAccounts")}</p>
        )}
      </section>

      {initial.pendingCount > 0 && (
        <p className="text-xs text-neutral-500">
          {initial.pendingCount} {t(dict, "platform.tenantDetail.pendingNote")}
        </p>
      )}
    </div>
  );
}