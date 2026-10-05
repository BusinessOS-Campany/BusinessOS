"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Platform-admin controls for one org's portable SQL file.
 *
 * The page reads the state server-side and hands it in as `initial`, so this
 * component has nothing to fetch on mount. It offers the four operations an
 * operator needs when a customer's file and their live schema have drifted:
 *
 *   Export  write the .sql now (what sign-out does)
 *   Import  load the .sql back, replacing the schema - destructive, confirmed
 *   Open    make sure the schema exists, loading the .sql if it is missing
 *   Download  save the .sql to disk
 *
 * Import replaces live customer data, so it asks for a second click and says
 * exactly what it is about to do. A failure is shown, never swallowed: the
 * operator is the only person who can fix a broken export.
 */

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export interface TenantSqlState {
  file: string;
  exists: boolean;
  bytes: number;
  sha256: string | null;
  exportedAt: string | null;
  schema: string;
  schemaPresent: boolean;
  rowsTotal: number;
  tablesWithRows: { table: string; rows: number }[];
}

export function TenantSqlManager({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: TenantSqlState;
}) {
  const router = useRouter();
  const [sql, setSql] = useState<TenantSqlState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  // Only re-reads after an action. The first render already has the truth, so
  // there is nothing to fetch on mount and no "Reading…" state to flash.
  async function load() {
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/sql`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { data?: { sql: TenantSqlState }; error?: { messageEn?: string } }
        | null;
      if (!res.ok || !json?.data?.sql) {
        setError(json?.error?.messageEn ?? `Request failed (${res.status})`);
        return;
      }
      setSql(json.data.sql);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read the SQL file");
    }
  }

  async function act(action: "export" | "save" | "open" | "import", extra?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: Record<string, unknown>; error?: { messageEn?: string } }
        | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.messageEn ?? `Request failed (${res.status})`);
      setNote(describe(action, json.data));
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
      setConfirmImport(false);
    }
  }

  const card = "rounded-xl border border-neutral-800 bg-neutral-900 p-4";
  const btn = "rounded border border-neutral-700 px-2.5 py-1 text-xs hover:text-white disabled:opacity-50";
  const danger = "rounded border border-red-900 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50";

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Database file</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={btn} disabled={busy !== null} onClick={() => void act("open")}>
            {busy === "open" ? "Opening…" : "Open org"}
          </button>
          <button className={btn} disabled={busy !== null} onClick={() => void act("export")}>
            {busy === "export" ? "Exporting…" : "Export now"}
          </button>
          <a
            className={btn}
            href={`/api/platform/tenants/${tenantId}/sql/download`}
            aria-disabled={!sql.exists}
          >
            Download
          </a>
          {confirmImport ? (
            <>
              <button className={danger} disabled={busy !== null} onClick={() => void act("import", { mode: "replace" })}>
                {busy === "import" ? "Replacing…" : `Yes, replace ${sql.schema}`}
              </button>
              <button className={btn} onClick={() => setConfirmImport(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className={danger}
              disabled={busy !== null || !sql.exists}
              title="Replaces the live schema with the contents of the file"
              onClick={() => setConfirmImport(true)}
            >
              Import…
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {note && <p className="mt-2 text-xs text-primary">{note}</p>}

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Schema</dt>
          <dd className="font-mono text-neutral-200">
            {sql.schema} {sql.schemaPresent ? "" : "(missing)"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">File</dt>
          <dd className="font-mono text-neutral-200">
            {sql.file} ({human(sql.bytes)})
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Last export</dt>
          <dd className="text-neutral-200">{sql.exportedAt ? new Date(sql.exportedAt).toLocaleString() : "never"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Rows</dt>
          <dd className="text-neutral-200">
            {sql.rowsTotal}
            {sql.tablesWithRows.length > 0 ? ` in ${sql.tablesWithRows.length} table(s)` : ""}
          </dd>
        </div>
        {sql.sha256 && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-neutral-500">SHA-256</dt>
            <dd className="truncate font-mono text-neutral-400">{sql.sha256}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function describe(action: string, data: Record<string, unknown>): string {
  const bytes = typeof data.bytes === "number" ? ` (${human(data.bytes)})` : "";
  switch (action) {
    case "export":
      return `Exported ${String(data.file)}${bytes}, ${String(data.rowsTotal)} rows.`;
    case "import":
      return `Loaded ${String(data.file)}${bytes} into ${String(data.mode)} in ${String(data.statements)} statements.`;
    case "open":
      return data.loadedFromFile
        ? "Schema was missing and has been rebuilt from the file."
        : data.schemaCreated
          ? "Schema created empty."
          : "Schema already present, nothing to do.";
    default:
      return `Saved${bytes}.`;
  }
}
