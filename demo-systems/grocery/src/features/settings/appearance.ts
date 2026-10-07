/**
 * Appearance resolution — org-level theme overrides, pure and DB-free.
 *
 * Deliberately NOT `server-only`: the settings form (a client component) renders
 * the preset/font catalogues from here, and the resolver itself is unit-tested
 * without a database.
 *
 * Everything funnels into CSS custom properties. `globals.css` declares
 * `@theme inline { --color-primary: var(--primary); … }`, so redefining those
 * variables recolours the whole app without touching a single component.
 *
 * Colours are stored as `#rrggbb` — NOT as arbitrary CSS — for three reasons:
 * validation is a regex, contrast maths is exact, and nothing user-supplied is
 * ever interpolated into the emitted stylesheet.
 */

/* ------------------------------------------------------------------ colour */

const HEX = /^#([0-9a-f]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim().toLowerCase());
}

function hexToRgb(hex: string): [number, number, number] {
  const m = HEX.exec(hex.trim().toLowerCase());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = "#ffffff";
const BLACK = "#000000";

/**
 * Black or white — whichever reads better on `hex`.
 *
 * Pure black rather than a softer near-black is deliberate, not laziness: the
 * crossover of the two ratios is sqrt(1.05 * 0.05) = 4.58, so max(black, white)
 * is provably >= 4.58:1 for ANY input. Substituting #0b1220 drops that
 * guarantee to ~4.35:1 and fails WCAG AA for mid-tone backgrounds.
 */
export function readableForeground(hex: string): string {
  return contrastRatio(hex, BLACK) >= contrastRatio(hex, WHITE) ? BLACK : WHITE;
}

/** Linear blend; t=0 returns `a`, t=1 returns `b`. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/* ----------------------------------------------------------- OKLab / OKLCH */

/** sRGB hex -> OKLCH. Björn Ottosson's OKLab matrices, D65. */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const [r8, g8, b8] = hexToRgb(hex);
  const srgb = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = srgb(r8), g = srgb(g8), b = srgb(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

const oklch = (l: number, c: number, h: number) =>
  `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;

/**
 * Five chart series derived from the brand hue.
 *
 * Hues sit on a regular pentagon (0/72/144/216/288) so the minimum angular gap
 * is 72deg — the same spacing the hand-tuned built-in ramp uses, and what keeps
 * every pair separable. Rotating hue in OKLCH holds perceived lightness and
 * chroma steady, so no series shouts over the others.
 *
 * Categorical separation must be judged with CIE76 dE, not WCAG contrast:
 * same-lightness hues of different hue legitimately score ~1.0:1 on luminance.
 */
export function buildChartRamp(primary: string, mode: "light" | "dark"): string[] {
  const { c, h } = hexToOklch(primary);
  const baseL = mode === "dark" ? 0.74 : 0.62;
  const chroma = Math.min(Math.max(c, 0.1), 0.17);
  // Small lightness stagger on top of the hue rotation, for colour-vision safety.
  const stagger = [0, 0.03, -0.02, 0.05, -0.04];
  return [0, 72, 144, 216, 288].map((offset, i) => {
    const L = Math.min(Math.max(baseL + stagger[i], 0.42), 0.85);
    return oklch(L, chroma, (h + offset) % 360);
  });
}

/* ------------------------------------------------------------- catalogues */

export interface AppearancePreset {
  id: string;
  /** Latin display name — the app UI is Arabic, but these are brand names. */
  label: string;
  primary: string;
  primaryDark: string;
  /** rem — feeds `--radius`, which drives `--radius-sm…4xl`. */
  radius: number;
}

/**
 * One click, whole-app recolour. The free colour pickers below are the escape
 * hatch; these are the paths most orgs will actually use.
 */
export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  { id: "emerald", label: "Emerald", primary: "#047857", primaryDark: "#34d399", radius: 0.75 },
  { id: "ocean",   label: "Ocean",   primary: "#1d4ed8", primaryDark: "#60a5fa", radius: 0.5 },
  { id: "royal",   label: "Royal",   primary: "#6d28d9", primaryDark: "#a78bfa", radius: 1 },
  { id: "rose",    label: "Rose",    primary: "#be123c", primaryDark: "#fb7185", radius: 1.25 },
  { id: "amber",   label: "Amber",   primary: "#b45309", primaryDark: "#fbbf24", radius: 0.375 },
  { id: "slate",   label: "Slate",   primary: "#334155", primaryDark: "#94a3b8", radius: 0.625 },
];

export interface AppearanceFont {
  id: string;
  /** Human-facing family name, shown in the picker. */
  label: string;
  /** The `next/font` CSS variable this family is exposed as. */
  cssVar: string;
}

/**
 * Curated on purpose. `next/font` cannot load a runtime URL, so an
 * arbitrary-URL field would mean a CSS `@import` at runtime — FOUC plus a CSP
 * hole. These are all self-hosted by `next/font`; only the selected family is
 * referenced, so the browser fetches just that one file.
 */
export const APPEARANCE_FONTS: readonly AppearanceFont[] = [
  { id: "cairo", label: "Cairo (افتراضي)", cssVar: "--font-sans" },
  { id: "tajawal", label: "Tajawal", cssVar: "--font-tajawal" },
  { id: "plex-arabic", label: "IBM Plex Sans Arabic", cssVar: "--font-plex-arabic" },
  { id: "almarai", label: "Almarai", cssVar: "--font-almarai" },
];

/* --------------------------------------------------------------- resolver */

export interface AppearanceInput {
  themePreset?: string | null;
  themePrimary?: string | null;
  themePrimaryDark?: string | null;
  themeBackground?: string | null;
  themeBackgroundDark?: string | null;
  themeFont?: string | null;
  themeRadius?: number | null;
}

export interface AppearanceTokens {
  /** Overrides for the light `:root` block. */
  light: Record<string, string>;
  /** Overrides for the `.dark` block. */
  dark: Record<string, string>;
  /** `--font-*` var to bind `--font-sans` to, or null for the default. */
  fontVar: string | null;
}

const clean = (v: string | null | undefined) =>
  typeof v === "string" && isHexColor(v) ? v.trim().toLowerCase() : null;

/** Tokens a brand colour is responsible for, derived — never hand-authored. */
function brandTokens(primary: string): Record<string, string> {
  const fg = readableForeground(primary);
  const ramp = buildChartRamp(primary, "light");
  return {
    "--primary": primary,
    "--primary-foreground": fg,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": fg,
    "--chart-1": ramp[0],
    "--chart-2": ramp[1],
    "--chart-3": ramp[2],
    "--chart-4": ramp[3],
    "--chart-5": ramp[4],
  };
}

/** Largest per-channel distance between two colours. */
function channelDelta(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
}

/**
 * Page background + the neutrals that have to move with it.
 *
 * Background alone is not enough: set a dark canvas under the built-in light
 * palette and you get white-on-dark body text with unreadable muted labels.
 * So foreground is contrast-derived, and card / border / muted-foreground are
 * blended off the chosen background to keep surfaces coherent in both modes.
 */
function surfaceTokens(background: string): Record<string, string> {
  const isLight = relativeLuminance(background) > 0.4;
  const fg = readableForeground(background);

  // A card must never equal the canvas or the surface separation collapses.
  // Blending white into a white background is a no-op, so nudge the other way
  // when that happens.
  let card = isLight ? mix(background, WHITE, 0.7) : mix(background, WHITE, 0.07);
  if (channelDelta(card, background) < 3) {
    card = isLight ? mix(background, BLACK, 0.03) : mix(background, WHITE, 0.06);
  }

  return {
    "--background": background,
    "--foreground": fg,
    "--card": card,
    "--popover": card,
    "--border": isLight ? mix(background, BLACK, 0.13) : mix(background, WHITE, 0.16),
    "--input": isLight ? mix(background, BLACK, 0.13) : mix(background, WHITE, 0.16),
    "--muted": isLight ? mix(background, BLACK, 0.04) : mix(background, WHITE, 0.05),
    "--secondary": isLight ? mix(background, BLACK, 0.04) : mix(background, WHITE, 0.05),
    "--muted-foreground": isLight ? mix(background, BLACK, 0.5) : mix(background, WHITE, 0.62),
  };
}

/**
 * Stored settings -> CSS overrides. Returns empty blocks when the org has
 * customised nothing, which is the common case: the shipped palette in
 * `globals.css` stays authoritative and nothing is emitted.
 */
export function resolveAppearanceTokens(input: AppearanceInput): AppearanceTokens {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  const preset = APPEARANCE_PRESETS.find((p) => p.id === input.themePreset?.trim());
  const explicitPrimary = clean(input.themePrimary);
  const explicitPrimaryDark = clean(input.themePrimaryDark);

  const lightPrimary = explicitPrimary ?? preset?.primary ?? null;
  const darkPrimary = explicitPrimaryDark ?? preset?.primaryDark ?? lightPrimary;

  if (lightPrimary) Object.assign(light, brandTokens(lightPrimary));
  if (darkPrimary) {
    const ramp = buildChartRamp(darkPrimary, "dark");
    Object.assign(dark, {
      "--primary": darkPrimary,
      "--primary-foreground": readableForeground(darkPrimary),
      "--ring": darkPrimary,
      "--sidebar-primary": darkPrimary,
      "--sidebar-primary-foreground": readableForeground(darkPrimary),
      "--chart-1": ramp[0],
      "--chart-2": ramp[1],
      "--chart-3": ramp[2],
      "--chart-4": ramp[3],
      "--chart-5": ramp[4],
    });
  }

  const bg = clean(input.themeBackground);
  if (bg) Object.assign(light, surfaceTokens(bg));

  const bgDark = clean(input.themeBackgroundDark);
  if (bgDark) Object.assign(dark, surfaceTokens(bgDark));

  // An explicit radius wins; otherwise the preset's own roundness applies, so
  // picking a preset is a genuinely one-click change.
  const explicitRadius =
    typeof input.themeRadius === "number" && Number.isFinite(input.themeRadius)
      ? input.themeRadius
      : null;
  const radius = explicitRadius ?? preset?.radius ?? null;
  if (radius !== null) {
    const rem = Math.min(Math.max(radius, 0), 2);
    light["--radius"] = `${rem}rem`;
    dark["--radius"] = `${rem}rem`;
  }

  const font = APPEARANCE_FONTS.find((f) => f.id === input.themeFont?.trim());

  return { light, dark, fontVar: font && font.id !== "cairo" ? font.cssVar : null };
}

/** Token maps -> the text of a single <style> element. Empty string if unset. */
export function appearanceStyleSheet(tokens: AppearanceTokens): string {
  const block = (selector: string, vars: Record<string, string>) => {
    const entries = Object.entries(vars);
    if (entries.length === 0) return "";
    const body = entries.map(([k, v]) => `  ${k}: ${v};`).join("\n");
    return `${selector} {\n${body}\n}\n`;
  };
  const parts = [
    block(":root", tokens.light),
    block(".dark", tokens.dark),
    // next/font declares --font-sans on <body> via a generated class, and an
    // element's own custom property always beats an inherited one — so a bare
    // :root rule would be silently dead. `:root body` both targets the element
    // that actually defines it and outranks that class on specificity.
    tokens.fontVar ? `:root body {\n  --font-sans: var(${tokens.fontVar});\n}\n` : "",
  ].filter(Boolean);
  return parts.join("\n");
}