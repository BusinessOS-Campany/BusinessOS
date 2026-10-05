"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrgSettings } from "@/core/tenancy/settings";

const PRESETS = [
  { name: "Emerald", primary: "#03EABC", accent: "#0263D1" },
  { name: "Indigo", primary: "#6366f1", accent: "#ec4899" },
  { name: "Amber", primary: "#f59e0b", accent: "#ef4444" },
  { name: "Slate", primary: "#475569", accent: "#0284c7" },
];

export function AppearanceBuilder({ initial }: { initial: OrgSettings }) {
  const router = useRouter();
  const [primary, setPrimary] = useState(initial.branding?.primary ?? "#03EABC");
  const [accent, setAccent] = useState(initial.branding?.accent ?? "#0ea5e9");
  const [radius, setRadius] = useState(initial.branding?.radius ?? 8);
  const [displayName, setDisplayName] = useState(initial.branding?.displayNameOverride ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.branding?.logoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/v1/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branding: {
          primary,
          accent,
          radius,
          displayNameOverride: displayName || undefined,
          logoUrl: logoUrl || undefined,
        },
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Saved");
      router.refresh();
    } else {
      setMsg(`Error ${res.status}`);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">Appearance</h1>
        <p className="mt-1 text-sm text-neutral-500">
          White-label tokens applied across this tenant instantly — no redeploy.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                setPrimary(p.primary);
                setAccent(p.accent);
              }}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              <span className="h-4 w-4 rounded-full" style={{ background: p.primary }} />
              <span className="h-4 w-4 rounded-full" style={{ background: p.accent }} />
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-neutral-700">
            Primary color
            <input
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="mt-1 block h-9 w-24 cursor-pointer rounded border border-neutral-300"
            />
          </label>
          <label className="text-sm text-neutral-700">
            Accent color
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="mt-1 block h-9 w-24 cursor-pointer rounded border border-neutral-300"
            />
          </label>
          <label className="text-sm text-neutral-700">
            Corner radius: {radius}px
            <input
              type="range"
              min={0}
              max={24}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-2 block w-full"
            />
          </label>
          <label className="text-sm text-neutral-700">
            Display name override
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="e.g. أسواق الفراشة"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-neutral-700 sm:col-span-2">
            Logo URL
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
        </div>

        {/* Live preview using the same CSS vars the shell consumes */}
        <div
          className="mt-6 rounded-xl border border-neutral-200 p-4"
          style={
            {
              "--brand-primary": primary,
              "--brand-accent": accent,
              "--brand-radius": `${radius}px`,
            } as React.CSSProperties
          }
        >
          <p className="mb-3 text-xs uppercase tracking-wide text-neutral-400">Preview</p>
          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 text-white"
              style={{ background: "var(--brand-primary)", borderRadius: "var(--brand-radius)" }}
            >
              Primary action
            </button>
            <button
              className="border px-4 py-2"
              style={{
                borderColor: "var(--brand-accent)",
                color: "var(--brand-accent)",
                borderRadius: "var(--brand-radius)",
              }}
            >
              Accent
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save appearance"}
          </button>
          {msg && <span className="text-sm text-neutral-500">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
