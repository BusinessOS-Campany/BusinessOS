"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { messageEn?: string };
    data?: unknown;
  };
  if (!res.ok) throw new Error(json.error?.messageEn ?? `Request failed (${res.status})`);
  return json.data;
}

const TEMPLATES = [
  { value: "grocery", label: "Grocery / Supermarket" },
  { value: "school", label: "School / Education" },
  { value: "restaurant", label: "Restaurant / Food Service" },
  { value: "clinic", label: "Clinic / Pharmacy" },
  { value: "retail", label: "Retail / General Store" },
];

export function TenantActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    planCode: "trial",
    ownerEmail: "",
    templateCode: "grocery",
  });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call("/api/platform/tenants/create", "POST", form);
      setOpen(false);
      setForm({ name: "", slug: "", planCode: "trial", ownerEmail: "", templateCode: "grocery" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
      >
        + New tenant
      </button>
    );
  }

  const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Shop name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
        <input required placeholder="slug (a-z 0-9 -)" value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} className={`${field} font-mono`} />
        <select value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })} className={field}>
          <option value="trial">Trial</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select value={form.templateCode} onChange={(e) => setForm({ ...form, templateCode: e.target.value })} className={field}>
          <option value="">No template</option>
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input required type="email" placeholder="Owner email (must exist)" value={form.ownerEmail}
          onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className={field} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Creating…" : "Create tenant"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:text-white">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TenantRowActions({
  tenantId,
  status,
  ownerUserId,
}: {
  tenantId: string;
  status: string;
  ownerUserId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded border border-neutral-700 px-2 py-0.5 text-xs hover:text-white disabled:opacity-50";

  return (
    <div className="flex gap-1.5">
      {status === "active" ? (
        <button disabled={busy} className={`${btn} text-red-300`}
          onClick={() => void run(() => call(`/api/platform/tenants/${tenantId}`, "PATCH", { status: "suspended" }))}>
          Suspend
        </button>
      ) : (
        <button disabled={busy} className={`${btn} text-primary`}
          onClick={() => void run(() => call(`/api/platform/tenants/${tenantId}`, "PATCH", { status: "active" }))}>
          Reactivate
        </button>
      )}
      {ownerUserId && (
        <button
          disabled={busy}
          className={btn}
          title="Impersonate the tenant owner"
          onClick={() =>
            void run(async () => {
              await call(`/api/platform/users/${ownerUserId}/impersonate`, "POST");
              // Full navigation so ALL server components re-read the swapped
              // session cookie — router.refresh() is not sufficient here.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/");
            })
          }
        >
          Impersonate
        </button>
      )}
    </div>
  );
}
