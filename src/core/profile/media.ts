/**
 * Server-side image validation for profile media.
 *
 * The browser tells you `File.type`; an attacker tells you whatever they like.
 * Every upload is therefore sniffed from its own bytes and the sniffed type must
 * agree with the declared one, so a `.png` that is really an HTML document (or a
 * polyglot) never reaches storage.
 *
 * Animated GIF is deliberately not accepted: avatars and covers are static
 * images, and GIF is the format most often used to smuggle payloads and to
 * blow past size limits via animation frames.
 */

export const MEDIA_MAX_BYTES = {
  avatar: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024,
} as const;

export type MediaKind = keyof typeof MEDIA_MAX_BYTES;

export const MEDIA_RECOMMENDED = {
  avatar: { w: 400, h: 400 },
  cover: { w: 1500, h: 400 },
} as const;

export type SniffedImage = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** Returns the sniffed type, or null when the bytes are not a supported image. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  // WebP: "RIFF" ....size.... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export type MediaRejection = "missing" | "empty" | "tooLarge" | "badType" | "mismatch" | "notAnImage";

export type MediaValidation =
  | { ok: true; sniffed: SniffedImage; bytes: Buffer }
  | { ok: false; reason: MediaRejection; maxBytes?: number };

/**
 * @param declaredMime the browser-reported `File.type`, cross-checked against
 *        the sniffed bytes. Pass "" when the client sent no type at all.
 */
export async function validateImageUpload(
  file: File | null | undefined,
  kind: MediaKind,
  declaredMime: string,
): Promise<MediaValidation> {
  const maxBytes = MEDIA_MAX_BYTES[kind];
  if (!file) return { ok: false, reason: "missing" };
  if (file.size === 0) return { ok: false, reason: "empty" };
  if (file.size > maxBytes) return { ok: false, reason: "tooLarge", maxBytes };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, reason: "notAnImage" };
  }

  const sniffed = sniffImage(bytes);
  if (!sniffed) return { ok: false, reason: "notAnImage" };
  // A declared type that disagrees with the content is either a broken client or
  // an attempt to smuggle a different format past the allowlist.
  if (declaredMime && declaredMime.toLowerCase() !== sniffed.mime) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, sniffed, bytes };
}

/** Storage key for a user's media. One file per user per kind: re-upload replaces. */
export function mediaKey(userId: string, kind: MediaKind, ext: string): string {
  return `profile/${kind}s/${userId}.${ext}`;
}

export const MEDIA_URL: Record<MediaKind, string> = {
  avatar: "/api/v1/profile/avatar",
  cover: "/api/v1/profile/cover",
};

/** Every extension that could hold a previously uploaded file of this kind. */
export function mediaCandidateKeys(userId: string, kind: MediaKind): string[] {
  return (["jpg", "png", "webp"] as const).map((ext) => mediaKey(userId, kind, ext));
}

/**
 * Cache policy for the read endpoints.
 *
 * `no-store` — which `next.config.ts` stamps on every `/api/:path*` — forbids
 * the browser from keeping the body at all, so a profile view re-downloaded the
 * whole avatar and cover every time. `private, no-cache` keeps the guarantee
 * that actually matters here (private bytes, never a shared cache entry, never
 * shown without asking) while leaving the browser free to hold the body and
 * revalidate it: an unchanged image then costs a 304 and zero transferred bytes.
 *
 * The freshness window is deliberately short. An avatar is replaced from this
 * same page, so anything long would show the previous photo after an upload.
 */
export const MEDIA_CACHE_CONTROL = "private, no-cache, must-revalidate, max-age=60";

/**
 * Validator for the stored bytes.
 *
 * Size plus mtime is what the filesystem already knows without being asked to
 * read the file, which is the point: a re-upload changes the mtime, so a
 * replaced avatar gets a new tag and a 304 can never outlive it. The residual
 * case — a same-size re-upload inside the filesystem's own mtime granularity —
 * is no worse than that granularity already is, and inventing a version counter
 * to close it would mean a column, a migration and a second source of truth.
 */
export function mediaEtag(size: number, mtimeMs: number): string {
  return `"${Math.trunc(size).toString(16)}-${Math.trunc(mtimeMs).toString(16)}"`;
}

/**
 * True when the client's copy is current, so the handler can answer 304 instead
 * of re-sending the image. `If-None-Match` is compared weakly and takes
 * precedence over `If-Modified-Since` (RFC 9110 §13.1.3); the date comparison is
 * truncated to whole seconds because that is all an HTTP-date can carry.
 */
export function mediaNotModified(headers: Headers, etag: string, mtimeMs: number): boolean {
  const match = headers.get("if-none-match");
  if (match !== null) {
    if (match.trim() === "*") return true;
    return match.split(",").some((tag) => tag.trim().replace(/^W\//i, "") === etag);
  }
  const since = headers.get("if-modified-since");
  if (since === null) return false;
  const parsed = Date.parse(since);
  if (!Number.isFinite(parsed)) return false;
  return Math.floor(mtimeMs / 1000) * 1000 <= parsed;
}
