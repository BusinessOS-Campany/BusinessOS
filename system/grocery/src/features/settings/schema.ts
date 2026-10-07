import { z } from "zod";
import { APPEARANCE_FONTS, APPEARANCE_PRESETS } from "./appearance";

/**
 * Logo value may be an external URL (legacy) or a stored object path
 * (uploaded from the device, e.g. `logos/<userId>/<uuid>.png`).
 */
const logoUrlField = z.union([
  z.string().trim().url().max(500),
  z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,249}$/),
]);

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(1).max(150),
  nameAr: z.string().trim().max(150).optional().or(z.literal("")),
  logoUrl: logoUrlField.optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  addressAr: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(150).optional().or(z.literal("")),
  currencyCode: z.string().trim().min(2).max(8),
  currencySymbol: z.string().trim().min(1).max(8),
  receiptFooter: z.string().trim().max(300).optional().or(z.literal("")),
});

export const salesSettingsSchema = z.object({
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z-]{1,8}$/, "1-8 letters/dashes")
    .transform((v) => v.toUpperCase()),
});

export const inventorySettingsSchema = z.object({
  lowStockThresholdDays: z.coerce.number().int().min(0).max(365),
  expirationWarningDays: z.coerce.number().int().min(1).max(365),
  batchTrackingEnabled: z.union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")]).transform((v) => v === "on" || v === "true"),
});

export const localizationSettingsSchema = z.object({
  dateFormat: z.enum(["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"]),
  timezone: z.string().trim().min(1).max(60),
});

export const securitySettingsSchema = z.object({
  passwordMinLength: z.coerce.number().int().min(6).max(64),
  sessionTimeoutMinutes: z.coerce.number().int().min(15).max(10080),
  maxLoginAttempts: z.coerce.number().int().min(3).max(20),
  lockoutMinutes: z.coerce.number().int().min(1).max(1440),
});

/**
 * Colours are `#rrggbb` only — never free-form CSS. That keeps validation a
 * regex, keeps the emitted stylesheet free of interpolated user input, and
 * keeps the contrast maths in appearance.ts exact.
 */
const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");
/** Empty string is the form's "use the built-in default" signal. */
const optionalHex = z.union([z.literal(""), hexColor]).optional();

export const appearanceSettingsSchema = z.object({
  themePreset: z
    .union([z.literal(""), z.string().trim().max(40)])
    .refine((v) => v === "" || APPEARANCE_PRESETS.some((p) => p.id === v), "unknown preset")
    .optional(),
  themePrimary: optionalHex,
  themePrimaryDark: optionalHex,
  themeBackground: optionalHex,
  themeBackgroundDark: optionalHex,
  themeFont: z
    .union([z.literal(""), z.string().trim()])
    .refine((v) => v === "" || APPEARANCE_FONTS.some((f) => f.id === v), "unknown font")
    .optional(),
  // Bounds mirror appearance.ts (0..2rem). They must not drift: the resolver
  // clamps rather than throws, so a wider schema would silently discard input.
  themeRadius: z.union([z.literal(""), z.coerce.number().min(0).max(2)]).optional(),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;
export type SalesSettingsInput = z.infer<typeof salesSettingsSchema>;
export type InventorySettingsInput = z.infer<typeof inventorySettingsSchema>;
export type LocalizationSettingsInput = z.infer<typeof localizationSettingsSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
export type AppearanceSettingsInput = z.infer<typeof appearanceSettingsSchema>;
