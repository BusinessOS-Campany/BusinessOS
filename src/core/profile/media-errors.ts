import { ApiError } from "@/core/http/api";
import type { MediaRejection } from "./media";

/**
 * Maps a media validation failure to the API's bilingual error envelope.
 * Lives in core rather than the route folder so both the avatar and the cover
 * route share it without either importing the other.
 */

const SPECS: Record<MediaRejection, { status: number; en: string; ar: string }> = {
  missing: { status: 400, en: "file field is required", ar: "حقل الملف مطلوب" },
  empty: { status: 400, en: "File is empty", ar: "الملف فارغ" },
  tooLarge: { status: 413, en: "File is larger than the allowed size", ar: "حجم الملف أكبر من المسموح" },
  badType: { status: 415, en: "Unsupported image type (use JPEG, PNG or WebP)", ar: "صيغة غير مدعومة" },
  mismatch: { status: 415, en: "File content does not match its declared type", ar: "محتوى الملف لا يطابق نوعه" },
  notAnImage: { status: 415, en: "File is not a supported image", ar: "الملف ليس صورة مدعومة" },
};

export function mediaError(reason: MediaRejection, maxBytes?: number): ApiError {
  const spec = SPECS[reason];
  const suffix = reason === "tooLarge" && maxBytes ? ` (max ${Math.round(maxBytes / 1024 / 1024)} MB)` : "";
  return new ApiError(spec.status, "BAD_IMAGE", spec.ar, `${spec.en}${suffix}`, maxBytes ? { maxBytes } : undefined);
}
