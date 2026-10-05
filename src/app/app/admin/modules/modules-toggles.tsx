"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModuleName } from "@/core/permissions/catalog";
import type { ModuleDef } from "@/core/modules/registry";

export function ModulesToggles({
  modules,
  enabled,
}: {
  modules: ModuleDef[];
  enabled: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(modules.map((m) => [m.name, enabled.includes(m.name)])),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Always-on core: sales/inventory are the system's backbone (M4 FK graph).
  const CORE: string[] = ["sales", "inventory"];

  async function apply(next: Record<string, boolean>) {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/v1/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modulesEnabled: Object.keys(next).filter((k) => next[k]) }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Saved");
      router.refresh();
    } else {
      setMsg(`Error ${res.status}`);
    }
  }

  function toggle(name: ModuleName) {
    if (CORE.includes(name)) return;
    const next = { ...state, [name]: !state[name] };
    setState(next);
    void apply(next);
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h1 className="text-lg font-semibold text-neutral-900">Modules</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Toggle optional modules for this organization. Disabled modules disappear from navigation
        and their APIs return 404. Sales & inventory are core and always on.
      </p>
      <ul className="mt-4 divide-y divide-neutral-100">
        {modules.map((m) => (
          <li key={m.name} className="flex items-center justify-between py-2.5">
            <div>
              <span className="text-sm font-medium text-neutral-800">{m.name}</span>
              <span className="ms-2 text-xs text-neutral-400">{m.href}</span>
            </div>
            <button
              role="switch"
              aria-checked={state[m.name]}
              disabled={saving || CORE.includes(m.name)}
              onClick={() => toggle(m.name)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                state[m.name] ? "bg-primary" : "bg-muted"
              } ${CORE.includes(m.name) ? "opacity-50" : ""}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  state[m.name] ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className="mt-3 text-sm text-neutral-500">{msg}</p>}
    </div>
  );
}
