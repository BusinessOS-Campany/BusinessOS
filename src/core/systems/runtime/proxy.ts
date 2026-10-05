import { NextResponse } from "next/server";
import { sharedPrisma } from "@/core/db/client";
import { getVaultEntry } from "@/core/org-vault/registry";
import { ensureOrgRuntime, stopOrgRuntime } from "./supervisor";
import { orgSystemPath, systemUpstreamUrl } from "./urls";
import { isSystemLoginRedirect } from "./cookies";
import { issueOrgToken } from "./org-token";
import { listCredentialsForInstall, markCredentialsSynced } from "@/core/systems/credentials";
import { getEnv } from "@/core/config/env";
import { logger } from "@/core/logging/logger";

/**
 * Serves an org's own copy of a system at the platform URL.
 *
 * `/{org}/{system}` is not a page in this app — it is the customer's system,
 * running from `orginazition/<org>/systems/<system>/` in its own Node process
 * against the org's own database. This handler is the only door to it: the org
 * comes from the URL (already resolved and authorized by the route under
 * `src/app/[org]/[system]`), then the request is forwarded to that org's runtime.
 *
 * Everything security-relevant happens here, because the runtime itself trusts
 * whoever can reach its port:
 *
 *  - the caller must be a member of the org named in the URL;
 *  - the org must actually have this system installed;
 *  - the browser never learns the runtime's port, and the port is bound to
 *    loopback, so the only way in is through this handler;
 *  - the org's identity is re-derived per request and signed into a token the
 *    runtime verifies, so a system can trust it without seeing platform cookies.
 */


/** Headers that describe one hop and must not be copied between connections. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/**
 * Headers describing a body we have already handled.
 *
 * `fetch` transparently decompresses a gzipped upstream response, so the bytes
 * this handler forwards are plain. Copying `content-encoding` across anyway
 * would tell the browser the plain bytes are still compressed, and it fails the
 * response with `ERR_CONTENT_DECODING_FAILED` — on every page of a system that
 * compresses, which is all of them for a real browser. `content-length` is
 * dropped for the same reason: the body is re-framed on the way out, so the
 * upstream count is not this response's count.
 */
const STRIPPED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length"]);

/** Path the system exposes for signing a platform user into its own session. */
const LINK_PATH = "/api/bos/link";

function gatewaySecret(): string {
  return getEnv().AUTH_SECRET;
}

function problem(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export interface SystemProxyResult {
  response: NextResponse;
  /** Set-Cookie values the platform must relay to the browser. */
  setCookies: string[];
}

/**
 * The caller, as the `/{org}/{system}` route resolved them: the org is the one
 * named in the URL and the user is proven to be a member of it, so nothing here
 * has to re-decide which org is being served.
 */
export interface SystemRequestScope {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  userId: string;
  role: string;
  email: string;
  name: string;
}

/**
 * The headers one request to a system is forwarded with.
 *
 * Most of them are the browser's own, but two are not simply copied, because
 * Next has already rewritten them by the time a route handler sees them:
 *
 *  - `x-forwarded-host` has to name the host the *browser* used. The system
 *    compares it against `Origin` to decide whether a Server Action is a CSRF
 *    attempt (`app-render/action-handler.js`), and it prefers `x-forwarded-host`
 *    over `Host`. `request.url` holds the platform's own address, so forwarding
 *    that makes every Server Action abort with a 500 and nothing a user submits
 *    is ever saved.
 *  - `Next-Url` is deleted from the request headers by `setVaryHeader`
 *    (`base-server.js`) once the platform has decided it does not need it for
 *    caching. The system is a second Next server that does need it: it is one of
 *    the four values hashed into the `_rsc` parameter, so without it the hash
 *    the browser sent can never match, and the system redirects to its own hash
 *    on every navigation until the browser gives up. `x-bos-next-url` is where
 *    `src/proxy.ts` parked the original while it was still readable.
 */
export function buildUpstreamHeaders(request: Request, platform: { host: string; proto: string }): Headers {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "cookie") headers.set(key, value);
  }
  // Whatever an outer reverse proxy already resolved wins: it saw the real
  // request, this process only sees the hop it accepted.
  headers.set(
    "x-forwarded-host",
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? platform.host,
  );
  headers.set("x-forwarded-proto", request.headers.get("x-forwarded-proto") ?? platform.proto);

  const parkedNextUrl = request.headers.get("x-bos-next-url");
  if (parkedNextUrl && !headers.has("next-url")) headers.set("next-url", parkedNextUrl);

  return headers;
}

/**
 * Resolves the caller's org, starts that org's runtime if it is not already up,
 * and forwards one request to it.
 *
 * `segments` is the path below `/{org}/{system}`; it is rejoined to rebuild the
 * upstream URL, because the customer's system decides what those paths mean.
 */
export async function proxySystemRequest(
  systemSlug: string,
  segments: string[],
  request: Request,
  scope: SystemRequestScope,
): Promise<SystemProxyResult> {
  const { organizationId, userId, role } = scope;

  // The org must have a vault entry before a runtime can be started for it: the
  // entry is what maps the slug to the folder that holds its files.
  const entry = getVaultEntry(scope.organizationSlug);
  if (!entry) {
    return {
      response: problem(
        409,
        "SYSTEM_NOT_PROVISIONED",
        `${systemSlug} is installed but its files have not been created for this organization yet`,
      ),
      setCookies: [],
    };
  }

  // The org must have installed this system. Without this check any member of
  // any org could reach a runtime by naming a system slug.
  const install = await sharedPrisma.organizationApp.findFirst({
    where: { organizationId, app: { slug: systemSlug }, status: { in: ["installed", "active"] } },
    select: { id: true, appId: true, app: { select: { slug: true } } },
  });
  if (!install) {
    return {
      response: problem(403, "SYSTEM_NOT_INSTALLED", `${scope.organizationName} has not installed ${systemSlug}`),
      setCookies: [],
    };
  }

  const basePath = orgSystemPath(scope.organizationSlug, systemSlug);
  const runtime = await ensureOrgRuntime({
    orgId: organizationId,
    orgSlug: scope.organizationSlug,
    systemSlug,
    basePath,
    gatewaySecret: gatewaySecret(),
  });

  const token = issueOrgToken({
    organizationId,
    organizationSlug: scope.organizationSlug,
    userId,
    email: scope.email,
    name: scope.name,
    role,
  });

  const incoming = new URL(request.url);
  const target = systemUpstreamUrl(runtime, segments, incoming.search);

  const headers = buildUpstreamHeaders(request, {
    host: incoming.host,
    proto: incoming.protocol.replace(":", ""),
  });
  headers.set("x-bos-gateway-token", token);

  // The system has its own session. The first time an org member reaches it
  // there is no system cookie, so the platform signs them in first and relays
  // the cookie the system issues. After that the browser carries it itself.
  const setCookies: string[] = [];
  const browserCookies = request.headers.get("cookie") ?? "";
  // One link per request, shared by both paths below: the up-front one and the
  // retry. Linking twice would mint two sessions for one page load.
  let linkedSession: string | null = null;
  const link = async (): Promise<void> => {
    // Only when this member's password has not reached this clone yet. Read
    // before the link call so the digest rides along on the request that creates
    // their account, instead of needing a second visit.
    const digest = await pendingDigestFor(scope.organizationId, install.appId, userId);
    const linked = await linkSession(runtime, token, browserCookies, digest);
    if (linked.setCookie && linked.sessionValue) {
      setCookies.push(linked.setCookie);
      linkedSession = linked.sessionValue;
    }
    // Marked only after the link succeeded. A link that failed leaves the digest
    // pending, so the next request tries again instead of silently believing a
    // clone has a password it never received.
    if (digest && linked.mirrored) {
      await markCredentialsSynced(scope.organizationId, install.appId, [digest.username]);
    }
  };

  if (!/\bgs_session=/.test(browserCookies)) {
    await link();
  }
  headers.set("cookie", linkedSession ? mergeCookie(browserCookies, linkedSession) : browserCookies);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const forward = (): Promise<Response> =>
    fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      // Streamed rather than buffered: a report or a receipt can be large.
      duplex: "half",
    } as RequestInit);

  let upstream: Response;
  try {
    upstream = await forward();
  } catch (err) {
    logger.error({ err, orgSlug: scope.organizationSlug, systemSlug }, "[runtime] proxy request failed");
    // A connection refused at this point means the process is gone, not that the
    // request was bad. Dropping it from the running set means the next request
    // boots a replacement instead of inheriting this answer for the rest of the
    // health window.
    stopOrgRuntime(scope.organizationSlug, systemSlug);
    return {
      response: problem(502, "SYSTEM_UNAVAILABLE", "This system could not be reached. Try again shortly."),
      setCookies,
    };
  }

  // The system sent the caller to its own login page. This is the case the whole
  // link mechanism exists for and it must never be shown to somebody the platform
  // has already signed in: the caller's platform session is proven, their
  // membership in this org is proven, and the system below simply has no usable
  // session for them right now — a cookie the browser kept past its expiry, a
  // clone that was rebuilt, or a session revoked on the platform side.
  //
  // So the platform re-links and repeats the request once. A single retry is the
  // whole of it: if the link cannot produce a session, the system's own login
  // page is the truthful answer and the user is told to use it.
  if (
    !linkedSession &&
    isSystemLoginRedirect({ status: upstream.status, location: upstream.headers.get("location") }, runtime.basePath)
  ) {
    await link();
    if (linkedSession) {
      headers.set("cookie", mergeCookie(browserCookies, linkedSession));
      try {
        upstream = await forward();
      } catch (err) {
        logger.error(
          { err, orgSlug: scope.organizationSlug, systemSlug, retry: true },
          "[runtime] proxy retry after re-link failed",
        );
      }
    }
  }

  const { headers: responseHeaders, setCookies: upstreamSetCookies } = splitUpstreamHeaders(upstream.headers);
  setCookies.push(...upstreamSetCookies);

  return {
    response: new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    }),
    setCookies,
  };
}

/**
 * Splits an upstream response's headers into the ones the browser should see and
 * the `Set-Cookie` values the platform has to relay itself.
 *
 * Exported so the rule that keeps compressed responses working is directly
 * testable, rather than only observable as a console error in a browser.
 */
export function splitUpstreamHeaders(upstream: Headers): { headers: Headers; setCookies: string[] } {
  const headers = new Headers();
  const setCookies: string[] = [];

  upstream.forEach((value, key) => {
    const name = key.toLowerCase();
    if (HOP_BY_HOP.has(name) || STRIPPED_RESPONSE_HEADERS.has(name)) return;
    // Next collapses repeated Set-Cookie into one comma-joined value, so the
    // cookies are split back out here instead of being relayed as one broken
    // header the browser would reject.
    if (name === "set-cookie") {
      setCookies.push(...splitSetCookieHeader(value));
      return;
    }
    headers.set(key, value);
  });

  return { headers, setCookies };
}

/**
 * Splits a `Set-Cookie` header value into individual cookies.
 *
 * `Headers.forEach` joins repeated `Set-Cookie` values with ", ", which is
 * ambiguous because an `Expires` attribute contains a comma of its own. A
 * cookie only starts a new entry at a comma that is followed by a name=value
 * pair, so that is what this splits on.
 */
export function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[^=;,\s]+=[^;]*)/).map((part) => part.trim()).filter(Boolean);
}

/**
 * This member's bcrypt digest for this (org, system) pair, or null when they have
 * none stored or the clone already has it.
 *
 * "Already has it" is the common case after a boot push, so this returns null on
 * the overwhelming majority of first-visits and no digest is ever re-sent.
 *
 * The digest rides along in the LINK call rather than needing its own round trip:
 * that call already reaches the clone and already creates this member's account,
 * so this is the moment where sending it costs nothing extra.
 */
async function pendingDigestFor(
  organizationId: string,
  appId: string,
  userId: string,
): Promise<{ username: string; passwordHash: string; appId: string } | null> {
  try {
    const mine = (await listCredentialsForInstall(organizationId, appId)).find(
      (c) => c.userId === userId && !c.synced,
    );
    if (!mine) return null;
    return { username: mine.username, passwordHash: mine.passwordHash, appId };
  } catch (err) {
    // A missing digest is not a failure: the member still gets gateway access,
    // which is exactly what happened before this existed.
    logger.warn({ err, organizationId, appId, userId }, "[credentials] reading digest failed");
    return null;
  }
}

/**
 * Asks the runtime to provision this platform user in its own database and hand
 * back a session. Best effort: a system that does not implement the link route
 * simply shows its own login page, which is the pre-existing behaviour.
 *
 * `passwordHash` is the member's own bcrypt digest, so their platform password
 * works on this clone too. It goes in the body, never the token, because a token
 * is signed but not encrypted.
 */
async function linkSession(
  runtime: { origin: string; basePath: string },
  token: string,
  browserCookies: string,
  passwordHash?: { username: string; passwordHash: string } | null,
): Promise<{ setCookie: string | null; sessionValue: string | null; mirrored: boolean }> {
  const failed = { setCookie: null, sessionValue: null, mirrored: false } as const;
  try {
    const response = await fetch(`${runtime.origin}${runtime.basePath}${LINK_PATH}`, {
      method: "POST",
      headers: {
        "x-bos-gateway-token": token,
        "content-type": "application/json",
        ...(browserCookies ? { cookie: browserCookies } : {}),
      },
      body: JSON.stringify(passwordHash ? { passwordHash: passwordHash.passwordHash } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return failed;

    const setCookie = response.headers.get("set-cookie");
    const match = setCookie ? /(?:^|;\s*)gs_session=([^;]*)/.exec(setCookie) : null;
    // The clone's own answer, not our assumption: it reports whether it stored
    // the digest, so a clone that rejected it does not get marked as synced.
    const body = (await response.json().catch(() => null)) as { passwordMirrored?: boolean } | null;
    return {
      setCookie,
      sessionValue: match?.[1] ? `gs_session=${match[1]}` : null,
      mirrored: body?.passwordMirrored === true,
    };
  } catch {
    return failed;
  }
}

function mergeCookie(existing: string, addition: string): string {
  return existing ? `${existing}; ${addition}` : addition;
}

/** Stops an org's runtime. Used by the uninstall path so the process does not linger. */
export function shutdownSystemRuntime(orgSlug: string, systemSlug: string): boolean {
  return stopOrgRuntime(orgSlug, systemSlug);
}
