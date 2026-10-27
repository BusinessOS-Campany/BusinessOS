import { githubConfig, createAppJwt, type GithubConfig } from "./auth";

/**
 * Minimal GitHub REST client for the control plane.
 *
 * Two credentials in play, never confused: the **App JWT** authenticates *as
 * the App* (list installations, mint tokens), and an **installation token**
 * authenticates as one installation (read its repos, branches, commits). The
 * App JWT is minted per call and never leaves this process; installation tokens
 * live for an hour and are cached in memory only — there is no reason to write
 * a credential to disk that the next request can re-mint.
 */

export class GithubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

export interface GithubInstallation {
  id: number;
  accountLogin: string;
  accountType: string;
  /** "all" | "selected" — which repos the installation may see. */
  repositorySelection: string;
  suspended: boolean;
}

export interface GithubRepo {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  pushedAt: string | null;
}

export interface GithubBranch {
  name: string;
  sha: string;
}

export interface GithubCommit {
  sha: string;
  message: string;
  authorLogin: string | null;
  committedAt: string;
}

/** A configuration problem, not a GitHub outage: reported, never retried. */
export class GithubNotConfiguredError extends Error {
  constructor() {
    super("GitHub App is not configured");
    this.name = "GithubNotConfiguredError";
  }
}

function requireConfig(): GithubConfig {
  const config = githubConfig();
  if (!config) throw new GithubNotConfiguredError();
  return config;
}

async function githubFetch<T>(
  url: string,
  authorization: string,
  init: RequestInit = {},
  apiBaseUrl = "https://api.github.com",
): Promise<T> {
  const response = await fetch(url.startsWith("http") ? url : `${apiBaseUrl}${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "BusinessOS-Platform",
      Authorization: authorization,
      ...(init.headers ?? {}),
    },
    // A hung GitHub call must fail rather than pin a request handler forever.
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Read the message but never echo the token or the whole body back.
    const detail = await response.text().catch(() => "");
    throw new GithubApiError(response.status, `GitHub request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function appAuth(): { authorization: string; config: GithubConfig } {
  const config = requireConfig();
  return { authorization: `Bearer ${createAppJwt(config.appId, config.privateKey)}`, config };
}

interface TokenEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<number, TokenEntry>();

/** Test seam: drops cached installation tokens. */
export function resetTokenCache(): void {
  tokenCache.clear();
}

/**
 * Mints (or reuses) an installation access token.
 *
 * Refreshed two minutes before expiry so a token cannot expire between this
 * check and GitHub reading it. GitHub itself expires them at one hour.
 */
export async function installationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - Date.now() > 120_000) return cached.token;

  const { authorization, config } = appAuth();
  const result = await githubFetch<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    authorization,
    { method: "POST" },
    config.apiBaseUrl,
  );
  const expiresAt = Date.parse(result.expires_at);
  tokenCache.set(installationId, {
    token: result.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 3_600_000,
  });
  return result.token;
}

async function installationFetch<T>(installationId: number, path: string, init: RequestInit = {}): Promise<T> {
  const config = requireConfig();
  const token = await installationToken(installationId);
  return githubFetch<T>(path, `Bearer ${token}`, init, config.apiBaseUrl);
}

/** Every installation of this App, normalised to the fields we store. */
export async function listInstallations(): Promise<GithubInstallation[]> {
  const { authorization, config } = appAuth();
  const result = await githubFetch<{
    installations: Array<{
      id: number;
      account: { login: string; type: string } | null;
      repository_selection: string;
      suspended_at: string | null;
    }>;
  }>("/app/installations?per_page=100", authorization, {}, config.apiBaseUrl);

  return result.installations.map((row) => ({
    id: row.id,
    accountLogin: row.account?.login ?? "unknown",
    accountType: row.account?.type ?? "Organization",
    repositorySelection: row.repository_selection,
    suspended: Boolean(row.suspended_at),
  }));
}

/** One installation's details, or null if GitHub does not know it. */
export async function getInstallation(installationId: number): Promise<GithubInstallation | null> {
  const { authorization, config } = appAuth();
  try {
    const row = await githubFetch<{
      id: number;
      account: { login: string; type: string } | null;
      repository_selection: string;
      suspended_at: string | null;
    }>(`/app/installations/${installationId}`, authorization, {}, config.apiBaseUrl);
    return {
      id: row.id,
      accountLogin: row.account?.login ?? "unknown",
      accountType: row.account?.type ?? "Organization",
      repositorySelection: row.repository_selection,
      suspended: Boolean(row.suspended_at),
    };
  } catch (err) {
    if (err instanceof GithubApiError && err.status === 404) return null;
    throw err;
  }
}

function toRepo(row: {
  id: number;
  full_name: string;
  owner: { login: string } | null;
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
  pushed_at: string | null;
}): GithubRepo {
  return {
    id: row.id,
    fullName: row.full_name,
    owner: row.owner?.login ?? row.full_name.split("/")[0],
    name: row.name,
    private: row.private,
    defaultBranch: row.default_branch,
    description: row.description,
    htmlUrl: row.html_url,
    pushedAt: row.pushed_at,
  };
}

/** Repositories this installation may read, newest push first. */
export async function listRepos(installationId: number): Promise<GithubRepo[]> {
  const result = await installationFetch<{ repositories: Parameters<typeof toRepo>[0][] }>(
    installationId,
    "/installation/repositories?per_page=100",
  );
  return result.repositories
    .map(toRepo)
    .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
}

/** A single repository, e.g. to confirm access before an import. */
export async function getRepo(installationId: number, owner: string, repo: string): Promise<GithubRepo | null> {
  try {
    const row = await installationFetch<Parameters<typeof toRepo>[0]>(
      installationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );
    return toRepo(row);
  } catch (err) {
    if (err instanceof GithubApiError && err.status === 404) return null;
    throw err;
  }
}

/** Branches of a repository, so the admin picks one rather than typing it. */
export async function listBranches(installationId: number, owner: string, repo: string): Promise<GithubBranch[]> {
  const rows = await installationFetch<Array<{ name: string; commit: { sha: string } }>>(
    installationId,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
  );
  return rows.map((row) => ({ name: row.name, sha: row.commit.sha })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolves a branch/tag/sha to the exact commit the deployment will build. */
export async function getCommit(
  installationId: number,
  owner: string,
  repo: string,
  ref: string,
): Promise<GithubCommit | null> {
  try {
    const row = await installationFetch<{
      sha: string;
      commit: { message: string; author: { name?: string; date?: string } | null };
      author: { login: string } | null;
    }>(installationId, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`);
    return {
      sha: row.sha,
      message: (row.commit.message ?? "").split("\n")[0].slice(0, 200),
      authorLogin: row.author?.login ?? null,
      committedAt: row.commit.author?.date ?? new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof GithubApiError && err.status === 404) return null;
    throw err;
  }
}

/** The browser URL that installs this App on an account. */
export function githubInstallUrl(slug?: string): string | null {
  const config = githubConfig();
  const appSlug = slug ?? config?.slug;
  return appSlug ? `https://github.com/apps/${appSlug}/installations/new` : null;
}

/** HTTPS clone URL used by the deployment worker. */
export function repoCloneUrl(repoFullName: string): string {
  return `https://github.com/${repoFullName}.git`;
}
