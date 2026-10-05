import { withRoute } from "@/core/http/api";
import { handleMediaDelete, handleMediaGet, handleMediaUpload } from "@/core/profile/media-handlers";

/**
 * Avatar upload/read/remove. Validation, size limits and cache headers live in
 * `core/profile/media` + `core/profile/media-handlers`, shared with the cover
 * route. Only the signed-in user can upload or read; the bytes are private.
 */

/** POST /api/v1/profile/avatar — multipart `file`. Replaces any previous avatar. */
export const POST = withRoute("v1.profile.avatar.upload", (request) => handleMediaUpload(request, "avatar"));

/** GET /api/v1/profile/avatar — the signed-in user's avatar. */
export const GET = withRoute("v1.profile.avatar.get", (request) => handleMediaGet(request, "avatar"));

/** DELETE /api/v1/profile/avatar — clear the column and delete the stored bytes. */
export const DELETE = withRoute("v1.profile.avatar.delete", (request) => handleMediaDelete(request, "avatar"));
