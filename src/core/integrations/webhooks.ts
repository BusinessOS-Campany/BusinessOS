import { createHash } from "node:crypto";
import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";

export interface DeliverWebhookInput {
  organizationId: string;
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Create a webhook delivery record and attempt delivery.
 * On failure, schedules retry with exponential backoff.
 */
export async function deliverWebhook(
  prisma: PrismaClient,
  input: DeliverWebhookInput,
): Promise<{ deliveryId: string; status: string }> {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: input.endpointId,
      organizationId: input.organizationId,
      isActive: true,
    },
  });
  if (!endpoint) throw ApiError.notFound("Webhook endpoint not found");

  const body = JSON.stringify(input.payload);
  let signature: string | null = null;
  if (endpoint.signingKey) {
    signature = `sha256=${createHash("sha256").update(endpoint.signingKey).update(body).digest("hex")}`;
  }

  const delivery = await prisma.webhookDelivery.create({
    data: {
      organizationId: input.organizationId,
      endpointId: input.endpointId,
      eventType: input.eventType,
      payload: input.payload as never,
      signature,
      status: "pending",
    },
  });

  // Attempt immediate delivery
  const result = await attemptDelivery(delivery.id, endpoint.url, body, signature, delivery.attempt);

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: result,
  });

  return { deliveryId: delivery.id, status: result.status as string };
}

async function attemptDelivery(
  deliveryId: string,
  url: string,
  body: string,
  signature: string | null,
  attempt: number,
): Promise<Record<string, unknown>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Delivery-Id": deliveryId,
      "X-Delivery-Attempt": String(attempt),
    };
    if (signature) headers["X-Webhook-Signature"] = signature;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const responseBody = await res.text().catch(() => "");

    if (res.ok) {
      return {
        status: "success",
        responseStatus: res.status,
        responseBody: responseBody.slice(0, 1000),
        deliveredAt: new Date(),
      };
    }

    return scheduleRetry(res.status, responseBody, attempt);
  } catch (err) {
    return scheduleRetry(0, err instanceof Error ? err.message : "unknown", attempt);
  }
}

function scheduleRetry(
  responseStatus: number,
  responseBody: string,
  currentAttempt: number,
): Record<string, unknown> {
  const maxAttempts = 3;
  if (currentAttempt >= maxAttempts) {
    return {
      status: "failed",
      responseStatus: responseStatus || null,
      responseBody: responseBody.slice(0, 1000),
      lastError: `Failed after ${maxAttempts} attempts`,
    };
  }
  // Exponential backoff: 30s, 2m, 8m
  const backoffMs = [30_000, 120_000, 480_000][currentAttempt - 1] ?? 480_000;
  return {
    status: "retrying",
    responseStatus: responseStatus || null,
    responseBody: responseBody.slice(0, 1000),
    lastError: responseBody.slice(0, 500),
    nextRetryAt: new Date(Date.now() + backoffMs),
    attempt: { increment: 1 },
  };
}

/** Verify a webhook signature against a signing key + body. */
export function verifyWebhookSignature(
  signingKey: string,
  body: string,
  signature: string,
): boolean {
  const expected = `sha256=${createHash("sha256").update(signingKey).update(body).digest("hex")}`;
  return expected === signature;
}

/** List delivery logs for an endpoint. */
export async function listDeliveries(
  prisma: PrismaClient,
  organizationId: string,
  endpointId: string,
  limit = 50,
) {
  return prisma.webhookDelivery.findMany({
    where: { organizationId, endpointId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      eventType: true,
      status: true,
      responseStatus: true,
      attempt: true,
      lastError: true,
      deliveredAt: true,
      createdAt: true,
    },
  });
}

/** Retry a failed delivery. */
export async function retryDelivery(
  prisma: PrismaClient,
  tenant: { organizationId: string; userId: string },
  deliveryId: string,
): Promise<{ deliveryId: string; status: string }> {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, organizationId: tenant.organizationId },
  });
  if (!delivery) throw ApiError.notFound("Delivery not found");
  if (delivery.status !== "failed" && delivery.status !== "retrying") {
    throw ApiError.badRequest("Only failed or retrying deliveries can be retried");
  }

  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } });
  if (!endpoint) throw ApiError.notFound("Endpoint not found");

  const body = JSON.stringify(delivery.payload);
  let signature: string | null = null;
  if (endpoint.signingKey) {
    signature = `sha256=${createHash("sha256").update(endpoint.signingKey).update(body).digest("hex")}`;
  }

  const result = await attemptDelivery(delivery.id, endpoint.url, body, signature, 1);

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { ...result, attempt: 1 },
  });

  return { deliveryId: delivery.id, status: result.status as string };
}
