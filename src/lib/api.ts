export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageAr: string,
    public readonly messageEn: string,
    public readonly details?: unknown,
  ) {
    super(messageEn);
    this.name = "ApiClientError";
  }
}

interface ErrorEnvelope {
  error: {
    code?: string;
    messageAr?: string;
    messageEn?: string;
    details?: unknown;
    requestId?: string;
  };
}

interface DataEnvelope<T> {
  data: T;
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  const json = await res.json() as DataEnvelope<T> | ErrorEnvelope;

  if (!res.ok) {
    const err = (json as ErrorEnvelope).error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.messageAr ?? "حدث خطأ غير متوقع",
      err?.messageEn ?? `Request failed (${res.status})`,
      err?.details,
    );
  }

  return (json as DataEnvelope<T>).data;
}

export function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  return api<T>(url, { ...init, method: "GET" });
}

export function apiPost<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return api<T>(url, {
    ...init,
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT, for the rare endpoint that is not a create or an update of a whole
 * resource — today only the credential confirmation on the profile systems tab.
 * Same envelope handling as the other verbs.
 */
export function apiPut<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return api<T>(url, {
    ...init,
    method: "PUT",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return api<T>(url, {
    ...init,
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE with an optional JSON body. Several endpoints need one (e.g. revoking
 * a specific session by id), so `body` mirrors apiPost/apiPatch rather than
 * forcing callers to hand-roll a fetch.
 */
export function apiDelete<T = void>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return api<T>(url, {
    ...init,
    method: "DELETE",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
