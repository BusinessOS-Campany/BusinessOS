"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnnouncementForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    titleEn: "",
    titleAr: "",
    bodyEn: "",
    bodyAr: "",
    severity: "info",
    audience: "all",
  });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { messageEn?: string } };
        throw new Error(json.error?.messageEn ?? `Failed (${res.status})`);
      }
      setOpen(false);
      setForm({ titleEn: "", titleAr: "", bodyEn: "", bodyAr: "", severity: "info", audience: "all" });
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
        + New announcement
      </button>
    );
  }

  const field =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Title (EN)" value={form.titleEn}
          onChange={(e) => setForm({ ...form, titleEn: e.target.value })} className={field} />
        <input required placeholder="العنوان (AR)" value={form.titleAr}
          onChange={(e) => setForm({ ...form, titleAr: e.target.value })} className={field} dir="rtl" />
        <textarea required placeholder="Body (EN)" value={form.bodyEn}
          onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} className={field} />
        <textarea required placeholder="النص (AR)" value={form.bodyAr}
          onChange={(e) => setForm({ ...form, bodyAr: e.target.value })} className={field} dir="rtl" />
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className={field}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className={field}>
          <option value="all">All tenants</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Publishing…" : "Publish"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:text-white">
          Cancel
        </button>
      </div>
    </form>
  );
}
