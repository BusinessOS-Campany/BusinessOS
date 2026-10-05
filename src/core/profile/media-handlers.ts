import { ApiError, checkSessionRateLimit, ok } from "@/core/http/api";
import { sharedPrisma } from "@/core/db/client";
import { getStorage } from "@/core/integrations/storage";
import { requireProfileSession } from "./service";
import { MEDIA_CACHE_CONTROL, MEDIA_URL, mediaCandidateKeys, mediaEtag, mediaKey, mediaNotModified, validateImageUpload, type MediaKind } from "./media";
import { mediaError } from "./media-errors";

/**
 * Shared request handlers for avatar and cover uploads/reads, so the two routes
 * cannot drift apart on validation, limits or cache headers.
 *
 * Convention: one file per user per kind, private, never publicly cacheable.
 * These return a `Response`; the route files wrap them in `withRoute` for
 * request-id propagation, security headers and the error envelope.
 */

/** Storage keys to try, newest layout first, then the pre-migration layout. */
const EXT_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/**
 * Avatars uploaded before the `profile/…` key layout landed still live at
 * `avatars/{id}.{ext}`. Without this fallback those existing files 404 the
 * moment the new handler ships, which would silently blank real users'
 * avatars. The legacy name is derived from a fixed literal, never from user
 * input, so it cannot widen the traversal surface.
 */
function legacyMediaKey(userId: string, kind: MediaKind, ext: string): string | null {
  return kind === "avatar" ? `avatars/${userId}.${ext}` : null;
}

export async function handleMediaUpload(request: Request, kind: MediaKind): Promise<Response> {
  const profile = await requireProfileSession(request.headers);

  const limit = checkSessionRateLimit(`profile:${kind}:${profile.userId}`, 10, 5 * 60_000);
  if (!limit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", "Too many uploads, slow down");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const result = await validateImageUpload(
    file instanceof File ? file : null,
    kind,
    file instanceof File ? file.type : "",
  );
  if (!result.ok) throw mediaError(result.reason, result.maxBytes);

  const storage = getStorage();
  const key = mediaKey(profile.userId, kind, result.sniffed.ext);
  await storage.write(key, result.bytes);

  // A re-upload can change the extension, so remove the file it replaced — and
  // any pre-migration copy, which is the only one that would otherwise survive.
  for (const stale of mediaCandidateKeys(profile.userId, kind)) {
    if (stale !== key) await storage.delete(stale).catch(() => undefined);
  }
  if (kind === "avatar") {
    for (const ext of Object.keys(EXT_MIME)) {
      await storage.delete(`avatars/${profile.userId}.${ext}`).catch(() => undefined);
    }
  }

  const url = MEDIA_URL[kind];
  await sharedPrisma.user.update({
    where: { id: profile.userId },
    data: kind === "avatar" ? { image: url } : { coverImage: url },
  });

  return ok({ url, bytes: result.bytes.byteLength, mime: result.sniffed.mime });
}

export async function handleMediaGet(request: Request, kind: MediaKind): Promise<Response> {
  const profile = await requireProfileSession(request.headers);
  const storage = getStorage();

  // Resolve the key first, with a stat per candidate instead of a read per
  // candidate. The old loop read (and threw away) up to six files to find the
  // one that existed; this touches no bytes on a hit until it has to.
  let found: { ext: keyof typeof EXT_MIME; size: number; mtimeMs: number } | null = null;
  for (const ext of Object.keys(EXT_MIME) as (keyof typeof EXT_MIME)[]) {
    const current = mediaKey(profile.userId, kind, ext);
    const legacy = legacyMediaKey(profile.userId, kind, ext);
    for (const key of legacy ? [current, legacy] : [current]) {
      const info = await storage.stat(key);
      if (info) {
        found = { ext, ...info };
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    throw ApiError.notFound(kind === "avatar" ? "Avatar not uploaded" : "Cover not uploaded");
  }

  const etag = mediaEtag(found.size, found.mtimeMs);
  const lastModified = new Date(found.mtimeMs).toUTCString();

  // The validator is derived from the file, not from a clock, so a re-upload
  // that replaces the bytes in the same millisecond still changes it.
  if (mediaNotModified(request.headers, etag, found.mtimeMs)) {
    return new Response(null, {
      status: 304,
      headers: { etag, "last-modified": lastModified, "cache-control": MEDIA_CACHE_CONTROL },
    });
  }

  const key = mediaKey(profile.userId, kind, found.ext);
  const buffer = await storage.read(key);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": EXT_MIME[found.ext],
      "content-length": String(found.size),
      // Private: an avatar is account data, never a shared cache entry.
      // `no-cache` still forces a revalidation on every load, which is what
      // makes a just-uploaded replacement show up — but an unchanged image
      // then costs a 304 instead of the whole file.
      "cache-control": MEDIA_CACHE_CONTROL,
      etag,
      "last-modified": lastModified,
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * DELETE /api/v1/profile/{avatar,cover} — drop the image, clear the column and
 * delete every stored copy (both key layouts) so removal does not leave the
 * bytes behind.
 */
export async function handleMediaDelete(request: Request, kind: MediaKind): Promise<Response> {
  const profile = await requireProfileSession(request.headers);
  const storage = getStorage();

  for (const stale of mediaCandidateKeys(profile.userId, kind)) {
    await storage.delete(stale).catch(() => undefined);
  }
  const legacyExts = kind === "avatar" ? Object.keys(EXT_MIME) : [];
  for (const ext of legacyExts) {
    const legacy = legacyMediaKey(profile.userId, kind, ext);
    if (legacy) await storage.delete(legacy).catch(() => undefined);
  }

  await sharedPrisma.user.update({
    where: { id: profile.userId },
    data: kind === "avatar" ? { image: null } : { coverImage: null },
  });

  return ok({ removed: true, url: null });
}
