/**
 * The org's own name for one of its installed systems.
 *
 * Stored on the `organizationApp` row (not the `app` catalog row) so renaming is
 * per-org: one customer can call its grocery install "البيانات الشخصية" while
 * every other customer keeps the catalog default. `null` clears the override and
 * falls back to the catalog name.
 *
 * Deliberately free of Prisma and Next imports: the profile overview and the
 * rename route both need it, and a pure module is testable without a database.
 */

/** Longest a customer-facing system name may be. */
export const SYSTEM_NAME_MAX = 120;

/** The override read off a settings blob, or null when there is not one. */
export function orgSystemDisplayName(settings: unknown): string | null {
  if (typeof settings !== "object" || settings === null) return null;
  const raw = (settings as { displayName?: unknown }).displayName;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= SYSTEM_NAME_MAX ? trimmed : null;
}

/**
 * Trims a submitted name, returning the value to store or null to clear the
 * override. Rejects anything past the limit so a 5kB string never reaches the
 * card title; control characters and bidi overrides are stripped because this
 * text is rendered into a heading.
 */
export function parseOrgSystemDisplayName(input: string): string | null {
  const trimmed = input
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  if (trimmed.length > SYSTEM_NAME_MAX) {
    throw new Error(`Name must be ${SYSTEM_NAME_MAX} characters or fewer`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Settings for the next save: the existing blob with `displayName` replaced.
 * Spread first so a receipt/currency override already on the row survives a
 * rename, and so clearing leaves an actually-empty object rather than null.
 */
export function withOrgSystemDisplayName(
  current: unknown,
  displayName: string | null,
): Record<string, unknown> {
  const settings = { ...((current as Record<string, unknown> | null) ?? {}) };
  if (displayName) settings.displayName = displayName;
  else delete settings.displayName;
  return settings;
}
