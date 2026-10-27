import { prisma } from "@/core/db/client";
import { logger } from "@/core/logging/logger";
import { recordInstallation } from "@/core/github/service";
import { enqueueDeployment, finaliseDelivery, recordDelivery } from "./queue";

/**
 * Turns a verified GitHub webhook into a queued deployment.
 *
 * The route verifies the signature; by the time anything here runs, the payload
 * is authenticated. What remains is routing: which events mean "deploy", which
 * mean "record"; everything else is recorded and dropped.
 *
 * Redelivery safety is the delivery id: GitHub retries any non-2xx, so the id is
 * claimed as a primary key *before* any work, and a replay returns "duplicate"
 * instead of redeploying.
 */

export type DeliveryStatus = "received" | "ignored" | "queued" | "error";

export interface WebhookResult {
  status: DeliveryStatus;
  detail: string;
}

interface PushPayload {
  ref?: string;
  after?: string;
  deleted?: boolean;
  repository?: { full_name?: string };
  head_commit?: { message?: string } | null;
}

interface InstallationPayload {
  action?: string;
  installation?: {
    id?: number;
    account?: { login?: string; type?: string };
    repository_selection?: string;
  };
}

/** Handles one authenticated delivery. Never throws: a bad payload is an "error" row. */
export async function handleGithubWebhook(input: {
  event: string;
  deliveryId: string;
  payload: unknown;
}): Promise<WebhookResult> {
  const payload = (typeof input.payload === "object" && input.payload !== null ? input.payload : {}) as Record<
    string,
    unknown
  >;
  const repoFullName = repoNameOf(input.event, payload);
  const action = typeof payload.action === "string" ? payload.action : null;

  const fresh = await recordDelivery({
    id: input.deliveryId,
    event: input.event,
    repoFullName,
    action,
    status: "received",
  });
  if (!fresh) {
    return { status: "ignored", detail: "duplicate delivery" };
  }

  let result: WebhookResult;
  try {
    result = await route(input.event, payload, action);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    logger.error({ err, event: input.event, deliveryId: input.deliveryId }, "[deploy] webhook failed");
    result = { status: "error", detail: text };
  }

  await finaliseDelivery(input.deliveryId, result.status, result.detail);
  return result;
}

function repoNameOf(event: string, payload: Record<string, unknown>): string | null {
  if (event === "push" || event === "repository") {
    const repo = payload.repository as { full_name?: string } | undefined;
    return repo?.full_name ?? null;
  }
  return null;
}

async function route(
  event: string,
  payload: Record<string, unknown>,
  action: string | null,
): Promise<WebhookResult> {
  switch (event) {
    case "ping":
      return { status: "received", detail: "pong" };
    case "push":
      return handlePush(payload as PushPayload);
    case "installation":
    case "installation_repositories":
      return handleInstallation(payload as InstallationPayload, action);
    default:
      return { status: "ignored", detail: `unhandled event "${event}"` };
  }
}

async function handlePush(payload: PushPayload): Promise<WebhookResult> {
  const repoFullName = payload.repository?.full_name;
  const after = payload.after ?? "";
  const ref = payload.ref ?? "";
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;

  // A branch deletion is a push of all-zeroes; there is no commit to deploy.
  if (!repoFullName || payload.deleted === true || /^0+$/.test(after)) {
    return { status: "ignored", detail: "no commit to deploy" };
  }

  const source = await prisma.systemSource.findFirst({ where: { repoFullName } });
  if (!source) return { status: "ignored", detail: `no imported system for ${repoFullName}` };
  if (source.archived) return { status: "ignored", detail: `system "${source.slug}" is disconnected` };
  if (source.branch !== branch) {
    return { status: "ignored", detail: `push to "${branch}", deploy branch is "${source.branch}"` };
  }

  const id = await enqueueDeployment({
    slug: source.slug,
    commitSha: after,
    commitMessage: payload.head_commit?.message ?? null,
    ref: branch,
    trigger: "webhook",
  });
  logger.info({ slug: source.slug, repo: repoFullName, branch, sha: after, deploymentId: id }, "[deploy] queued from push");
  return { status: "queued", detail: `deployment ${id} for ${source.slug}@${after.slice(0, 10)}` };
}

async function handleInstallation(payload: InstallationPayload, action: string | null): Promise<WebhookResult> {
  const installation = payload.installation;
  const id = installation?.id;
  if (!id) return { status: "ignored", detail: "installation event without an id" };

  await recordInstallation({
    id,
    accountLogin: installation?.account?.login ?? "unknown",
    accountType: installation?.account?.type ?? "Organization",
    repositorySelection: installation?.repository_selection ?? "all",
    suspended: action === "suspend" || action === "deleted",
  });
  return { status: "received", detail: `installation ${id} ${action ?? "updated"}` };
}
