/**
 * Counts the SQL statements one request actually sends to PostgreSQL.
 *
 * The code-level audit can say "this calls Prisma four times"; it cannot say
 * how many round trips a page really costs, because the driver adapter hides
 * them. This instrument patches `pg`'s Client BEFORE any pool exists, so every
 * statement the app issues - through the shared pool or a per-tenant pool - is
 * counted, with the table it touched and its round-trip time.
 *
 * It calls the real route handlers in-process with a real session cookie, so
 * the number is the same work the HTTP server does, minus transport.
 *
 * Usage:
 *   npx tsx scripts/perf-query-count.ts <cookie> src/app/api/v1/products/route.ts [more...]
 *   PERF_METHOD=POST PERF_BODY='{...}' npx tsx scripts/perf-query-count.ts <cookie> <route>
 *
 * Mint a cookie first with: npx tsx scripts/perf-probe-login.ts [email]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  try {
    for (const raw of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim();
    }
  } catch {
    /* optional */
  }
}

type Stmt = { sql: string; ms: number };

interface Row {
  route: string;
  status: number;
  stmts: number;
  reads: number;
  writes: number;
  sqlMs: number;
  wallMs: number;
  top: Array<[string, number]>;
  repeated: number;
}

/** First identifier that looks like a table the statement touched. */
function tableOf(sql: string): string {
  const patterns = [
    /FROM\s+"?(?:[A-Za-z0-9_]+\.)?"?([A-Za-z0-9_]+)"?/i,
    /INTO\s+"?(?:[A-Za-z0-9_]+\.)?"?([A-Za-z0-9_]+)"?/i,
    /UPDATE\s+"?(?:[A-Za-z0-9_]+\.)?"?([A-Za-z0-9_]+)"?/i,
  ];
  for (const p of patterns) {
    const m = p.exec(sql);
    if (m) return m[1];
  }
  return "(other)";
}

function kindOf(sql: string): string {
  const head = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (head === "SELECT") return "read";
  if (head === "BEGIN" || head === "COMMIT" || head === "ROLLBACK") return "tx";
  if (head === "SET" || head === "SHOW") return "session";
  return "write";
}

async function main(): Promise<void> {
  const cookie = process.argv[2];
  const routeArgs = process.argv.slice(3);
  if (!cookie || routeArgs.length === 0) {
    console.error(
      "usage: npx tsx scripts/perf-query-count.ts <cookie> <route.ts> [more...]\n" +
        "  mint a cookie with: npx tsx scripts/perf-probe-login.ts [email]",
    );
    process.exit(2);
  }

  /* The instrument. Patched before the app constructs any Pool. */
  const pg = await import("pg");
  const ClientCtor = (pg as unknown as { Client: { prototype: Record<string, unknown> } }).Client;
  const proto = ClientCtor.prototype as unknown as {
    query: (...args: unknown[]) => unknown;
  };
  const originalQuery = proto.query;
  let capture = false;
  let stmts: Stmt[] = [];

  proto.query = function patched(this: unknown, ...args: unknown[]) {
    if (!capture) return originalQuery.apply(this, args);
    const first = args[0];
    const text =
      typeof first === "string" ? first : ((first as { text?: string } | null)?.text ?? "");
    const started = performance.now();
    const done = (): void => {
      stmts.push({ sql: text, ms: performance.now() - started });
    };
    const result = originalQuery.apply(this, args);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(
        (v: unknown) => {
          done();
          return v;
        },
        (e: unknown) => {
          done();
          throw e;
        },
      );
    }
    done();
    return result;
  };

  const showSql = process.env.PERF_SHOW_SQL === "1";
  const method = (process.env.PERF_METHOD ?? "GET") as "GET" | "POST";
  const host = process.env.PERF_HOST ?? "localhost:3100";
  const path = process.env.PERF_PATH ?? "/api/v1/products";
  const url = `http://${host}${path}`;
  const results: Row[] = [];
  const sqOfRoute = new Map<string, Stmt[]>();

  for (const routeArg of routeArgs) {
    // Relative path import: tsx resolves `@/` from each module's own location in
    // the app tree, but is unreliable for the very first spec here. The app's
    // own internal `@/` imports then resolve normally from under src/.
    const spec = routeArg.startsWith("src/") ? `../${routeArg}` : `../src/${routeArg}`;
    const mod = (await import(spec)) as Record<string, unknown>;
    const handler = mod[method] ?? mod.GET;
    if (typeof handler !== "function") {
      console.error(`  !! ${routeArg} exports no ${method}`);
      continue;
    }
    const invoke = handler as (r: Request, c: unknown) => Promise<Response>;
    const makeRequest = (): Request =>
      new Request(url, {
        method: typeof handler === "function" && mod[method] ? method : "GET",
        headers: { cookie, host, "content-type": "application/json" },
        ...(process.env.PERF_BODY ? { body: process.env.PERF_BODY } : {}),
      });

    // warm once: lazy imports and pool creation are setup, not per-request work
    await invoke(makeRequest(), {}).then((r) => r.arrayBuffer()).catch(() => undefined);

    stmts = [];
    capture = true;
    const wallStart = performance.now();
    const res = await invoke(makeRequest(), {});
    const wallMs = performance.now() - wallStart;
    capture = false;
    await res.arrayBuffer().catch(() => undefined);

    const reads = stmts.filter((s) => kindOf(s.sql) === "read").length;
    const writes = stmts.filter((s) => kindOf(s.sql) === "write").length;
    const byTable = new Map<string, number>();
    for (const s of stmts) {
      const t = tableOf(s.sql);
      byTable.set(t, (byTable.get(t) ?? 0) + 1);
    }

    sqOfRoute.set(routeArg, stmts);

    results.push({
      route: routeArg,
      status: res.status,
      stmts: stmts.length,
      reads,
      writes,
      sqlMs: Math.round(stmts.reduce((n, s) => n + s.ms, 0)),
      wallMs: Math.round(wallMs),
      top: [...byTable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7),
      repeated: stmts.length - byTable.size,
    });
  }

  const orgVault = await import("@/core/org-vault/sql-file").catch(
    () =>
      ({
        closeOrgSqlPools: async () => undefined,
      }) as { closeOrgSqlPools: () => Promise<void> },
  );
  await orgVault.closeOrgSqlPools?.();

  const pad = (s: string | number, n: number): string => String(s).padEnd(n);
  console.log("");
  console.log(pad("route", 44) + pad("st", 6) + pad("status", 8) + pad("read", 7) + pad("write", 7) + pad("sqlms", 8) + "wallms");
  console.log("-".repeat(100));
  for (const r of results) {
    console.log(
      pad(r.route.slice(0, 43), 44) +
        pad(r.stmts, 6) +
        pad(r.status, 8) +
        pad(r.reads, 7) +
        pad(r.writes, 7) +
        pad(r.sqlMs, 8) +
        r.wallMs,
    );
    console.log(
      "    " +
        r.top.map(([t, n]) => `${t} x${n}`).join(", ") +
        (r.repeated > 0 ? `   (+${r.repeated} repeated)` : ""),
    );
    if (showSql) {
      const seen = new Map<string, number>();
      for (const s of sqOfRoute.get(r.route) ?? []) {
        seen.set(s.sql, (seen.get(s.sql) ?? 0) + 1);
      }
      for (const [sql, n] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
        const oneLine = sql.replace(/\s+/g, " ").trim();
        console.log(`       ${n > 1 ? `[x${n}] ` : ""}${oneLine.slice(0, 200)}`);
      }
    }
  }
  console.log("");
  process.exit(0);
}

main();
