import { Client } from "pg";
import { sanitizeFolderName } from "./paths";

/**
 * One PostgreSQL DATABASE per organization.
 *
 * The platform keeps its own database (identity, orgs, apps, memberships) and
 * every org additionally gets a database of its own for its profile data, its
 * business data and the systems it has installed. A system clone running as its
 * own process connects here and to nowhere else, so a query in one customer's
 * system cannot reach another customer's rows even if a `search_path` is wrong.
 *
 * The database lives on the same PostgreSQL server as the platform, so creating
 * one is `CREATE DATABASE` and there is no new server to operate, secure or
 * back up separately. `database/<folder>.sql` remains the portable copy.
 *
 * Naming is `org_<folder>`, derived from the vault folder name, so the database
 * an org owns is obvious from the folder that holds its files.
 */

/** Longest a database name may be; PostgreSQL's limit is 63 bytes. */
const MAX_DATABASE_NAME = 63;

/** The org's own database, named after its vault folder. */
export function orgDatabaseName(folder: string): string {
  return `org_${sanitizeFolderName(folder)}`.slice(0, MAX_DATABASE_NAME);
}

/**
 * `DATABASE_URL` pointed at one org's database instead of the platform's.
 *
 * Only the path component is swapped — host, port, user and password all stay
 * the shared server's, which is what makes a per-org database cheap to create
 * and impossible to misconfigure. Returns null when `DATABASE_URL` is unset or
 * has no database path to replace.
 */
export function orgDatabaseUrl(folder: string): string | null {
  const base = process.env.DATABASE_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.pathname = `/${orgDatabaseName(folder)}`;
    // The platform sets ?schema=; a fresh database has nothing in it yet, so the
    // clone's own migrations decide the layout and `public` is the only schema
    // that is guaranteed to exist.
    url.searchParams.delete("schema");
    return url.toString();
  } catch {
    return null;
  }
}

/** A client on the maintenance database, used only for CREATE/DROP DATABASE. */
function maintenanceClient(): Client {
  const base = process.env.DATABASE_URL?.trim();
  if (!base) throw new Error("[vault] DATABASE_URL is not set");
  const url = new URL(base);
  // `postgres` always exists on a fresh server, so it is the one database we can
  // connect to in order to create another one.
  url.pathname = "/postgres";
  url.searchParams.delete("schema");
  return new Client({ connectionString: url.toString() });
}

/** Quote an identifier for CREATE/DROP DATABASE, which take no parameters. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export interface OrgDatabaseInfo {
  name: string;
  url: string;
  created: boolean;
}

async function withMaintenance<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = maintenanceClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function orgDatabaseExists(folder: string): Promise<boolean> {
  const name = orgDatabaseName(folder);
  return withMaintenance(async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return (rowCount ?? 0) > 0;
  });
}

/**
 * Creates the org's database if it is missing. Idempotent and safe to call on
 * every open: the expensive part (migrations, seed data) belongs to the system
 * runtime, not here.
 */
export async function ensureOrgDatabase(folder: string): Promise<OrgDatabaseInfo> {
  const name = orgDatabaseName(folder);
  const url = orgDatabaseUrl(folder);
  if (!url) throw new Error("[vault] cannot build a per-org DATABASE_URL");

  const created = await withMaintenance(async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if ((rowCount ?? 0) > 0) return false;
    // CREATE DATABASE cannot run inside a transaction block, and cannot be
    // parameterised, which is why it is not part of the shared client.
    await client.query(`CREATE DATABASE ${quoteIdent(name)}`);
    return true;
  });

  return { name, url, created };
}

/**
 * Drops the org's database. Only ever called from the explicit destroy path —
 * a missing database is reported as `false`, not treated as an error.
 */
export async function dropOrgDatabase(folder: string): Promise<boolean> {
  const name = orgDatabaseName(folder);
  return withMaintenance(async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if ((rowCount ?? 0) === 0) return false;
    // No database other than this org's can be connected to right now, so there
    // is nothing to terminate; a leftover idle session is handled by FORCE.
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
    return true;
  });
}
