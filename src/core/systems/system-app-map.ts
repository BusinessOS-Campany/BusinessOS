/**
 * Maps selectable system keys to the platform catalog app slug that gets
 * queued for approval. Keys accept BOTH the marketplace catalog IDs (what the
 * /systems cards pass, e.g. "grocery-store") and the old onboarding template
 * codes (e.g. "grocery"). Shared by the request API (server) and the
 * marketplace UI (client) so both agree on which systems are requestable.
 */
export const SYSTEM_APP_MAP: Record<string, string> = {
  // Catalog IDs (marketplace `system.id`)
  "grocery-store": "grocery",
  "med-center": "sama-center",
  "clinic-management": "sama-center",
  physiotherapy: "sama-center",
  "dental-clinic": "dental",
  "hospital-management": "hospital",
  "pharmacy-management": "pharmacy",
  laboratory: "laboratory",
  optometry: "optometry",
  pos: "pos",
  cafe: "cafe",

  // Template codes (legacy / onboarding aliases)
  grocery: "grocery",
  clinic: "sama-center",
  hospital: "hospital",
  dental: "dental",
  pharmacy: "pharmacy",
};

/** True when a system key maps to a real catalog app that can be requested. */
export function isRequestableSystem(systemKey: string | undefined): boolean {
  return systemKey != null && systemKey in SYSTEM_APP_MAP;
}

/** Catalog app slug for a selectable system key (undefined → not requestable). */
export function appSlugForSystem(systemKey: string | undefined): string | undefined {
  return systemKey ? SYSTEM_APP_MAP[systemKey] : undefined;
}