"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  templateCode: string | null;
  createdAt: string;
  ownerEmail: string;
  ownerName: string;
  status?: "pending" | "rejected";
}
interface AppOption { slug: string; label: string }
interface PlanOption { code: string; label: string }

async function call(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { messageEn?: string; messageAr?: string };
  };
  if (!res.ok) throw new Error(json.error?.messageAr ?? json.error?.messageEn ?? `Request failed (${res.status})`);
}

export function ApprovalPanel({
  org,
  suggestedApp,
  apps,
  plans,
  roles,
  dict,
  locale,
}: {
  org: OrgRow;
  suggestedApp: string;
  apps: AppOption[];
  plans: PlanOption[];
  roles: readonly string[];
  dict: Dictionary;
  locale: Locale;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "trial");
  const [ownerRole, setOwnerRole] = useState("owner");
  const [selectedApps, setSelectedApps] = useState<string[]>(
    suggestedApp ? [suggestedApp] : [],
  );
  const rejected = org.status === "rejected";

  function toggleApp(slug: string) {
    setSelectedApps((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/platform/approvals/${org.id}`, {
        action,
        planCode,
        ownerRole,
        appSlugs: selectedApps,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-medium">{org.name}</h2>
            <span className="font-mono text-xs text-neutral-500">@{org.slug}</span>
            {rejected && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                {t(dict, "platform.approvals.rejected")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {org.ownerName} &lt;{org.ownerEmail}&gt; · {new Date(org.createdAt).toLocaleString(locale)}
          </p>
          {org.templateCode && (
            <p className="mt-1 text-xs text-neutral-500">
              {t(dict, "platform.approvals.template")} {org.templateCode}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {!open && (
            <>
              {!rejected && (
                <button
                  disabled={busy}
                  onClick={() => void decide("reject")}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-red-800 hover:text-red-300 disabled:opacity-50"
                >
                  {t(dict, "platform.approvals.reject")}
                </button>
              )}
              <button
                onClick={() => setOpen(true)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
              >
                {rejected
                  ? t(dict, "platform.approvals.reapprove")
                  : t(dict, "platform.approvals.approve")}
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4">
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-400">{t(dict, "platform.approvals.grantApps")}</p>
            {apps.length === 0 ? (
              <p className="text-xs text-neutral-500">{t(dict, "platform.approvals.noApps")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {apps.map((a) => {
                  const checked = selectedApps.includes(a.slug);
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      onClick={() => toggleApp(a.slug)}
                      className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                        checked
                          ? "border-primary bg-primary/20 text-white"
                          : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">{t(dict, "platform.approvals.plan")}</p>
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-primary"
              >
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>{p.label} ({p.code})</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">{t(dict, "platform.approvals.ownerRole")}</p>
              <select
                value={ownerRole}
                onChange={(e) => setOwnerRole(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-primary"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => void decide("approve")}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? t(dict, "platform.approvals.saving") : t(dict, "platform.approvals.confirmApproval")}
            </button>
            <button
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:text-white"
            >
              {t(dict, "common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}