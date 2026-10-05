import { withRoute } from "@/core/http/api";
import { handleMediaDelete, handleMediaGet, handleMediaUpload } from "@/core/profile/media-handlers";

/**
 * Cover/banner upload/read. Same rules as the avatar (see
 * `core/profile/media`), larger ceiling: 5 MB vs 2 MB.
 */

/** POST /api/v1/profile/cover — multipart `file`. Replaces any previous cover. */
export const POST = withRoute("v1.profile.cover.upload", (request) => handleMediaUpload(request, "cover"));

/** GET /api/v1/profile/cover — the signed-in user's cover. */
export const GET = withRoute("v1.profile.cover.get", (request) => handleMediaGet(request, "cover"));

/** DELETE /api/v1/profile/cover — clear the column and delete the stored bytes. */
export const DELETE = withRoute("v1.profile.cover.delete", (request) => handleMediaDelete(request, "cover"));
