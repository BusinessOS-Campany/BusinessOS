// Relative, not `@/`: the shared root vitest.config.ts aliases "@" to the
// PLATFORM src, so "@/..." would resolve into the wrong tree from here.
import { describe, expect, it } from "vitest";
import { appearanceSettingsSchema } from "../src/features/settings/schema";
import {
  APPEARANCE_FONTS,
  APPEARANCE_PRESETS,
  appearanceStyleSheet,
  buildChartRamp,
  contrastRatio,
  hexToOklch,
  readableForeground,
  relativeLuminance,
  resolveAppearanceTokens,
  type AppearanceInput,
} from "../src/features/settings/appearance";

const NOTHING: AppearanceInput = {};

function toHex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

describe("readableForeground", () => {
  it("returns black on a near-white primary", () => {
    // The regression this exists to prevent: a pale button rendered with
    // white text, i.e. invisible.
    expect(readableForeground("#fde68a")).toBe("#000000");
    expect(readableForeground("#ffffff")).toBe("#000000");
  });

  it("returns white on a dark primary", () => {
    expect(readableForeground("#047857")).toBe("#ffffff");
    expect(readableForeground("#000000")).toBe("#ffffff");
  });

  it("clears WCAG AA (4.5:1) for EVERY possible background", () => {
    // The guarantee is mathematical: the black/white crossover sits at
    // sqrt(1.05 * 0.05) = 4.58, so max(black, white) >= 4.58 always.
    for (let v = 0; v <= 255; v++) {
      const grey = toHex(v * 0x010101);
      const ratio = contrastRatio(grey, readableForeground(grey));
      expect(ratio, `grey ${grey}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears AA for every preset and both its modes", () => {
    for (const p of APPEARANCE_PRESETS) {
      expect(contrastRatio(p.primary, readableForeground(p.primary)), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.primaryDark, readableForeground(p.primaryDark)), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("resolveAppearanceTokens", () => {
  it("emits nothing at all when the org has customised nothing", () => {
    const t = resolveAppearanceTokens(NOTHING);
    expect(t.light).toEqual({});
    expect(t.dark).toEqual({});
    expect(t.fontVar).toBeNull();
    // Empty string => no <style> tag is rendered, so globals.css stays authoritative.
    expect(appearanceStyleSheet(t)).toBe("");
  });

  it("treats all-null columns (the real DB default) as unset", () => {
    const t = resolveAppearanceTokens({
      themePreset: null, themePrimary: null, themePrimaryDark: null,
      themeBackground: null, themeBackgroundDark: null,
      themeFont: null, themeRadius: null,
    });
    expect(appearanceStyleSheet(t)).toBe("");
  });

  it("expands a preset into a complete token block", () => {
    const preset = APPEARANCE_PRESETS.find((p) => p.id === "royal")!;
    const { light, dark } = resolveAppearanceTokens({ themePreset: "royal" });

    expect(light["--primary"]).toBe(preset.primary);
    expect(light["--primary-foreground"]).toBe(readableForeground(preset.primary));
    expect(light["--ring"]).toBe(preset.primary);
    expect(light["--sidebar-primary"]).toBe(preset.primary);
    for (let i = 1; i <= 5; i++) {
      expect(light[`--chart-${i}`], `chart-${i}`).toMatch(/^oklch\(/);
    }
    expect(light["--radius"]).toBe(`${preset.radius}rem`);

    // Dark mode gets its OWN primary, not the light one.
    expect(dark["--primary"]).toBe(preset.primaryDark);
    expect(dark["--primary"]).not.toBe(light["--primary"]);
  });

  it("lets an explicit colour override the preset", () => {
    const { light } = resolveAppearanceTokens({
      themePreset: "royal",
      themePrimary: "#be123c",
    });
    expect(light["--primary"]).toBe("#be123c");
    // Preset radius still applies — only the colour was overridden.
    expect(light["--radius"]).toBe("1rem");
  });

  it("gives a near-white primary a dark foreground", () => {
    const { light } = resolveAppearanceTokens({ themePrimary: "#fef3c7" });
    expect(light["--primary"]).toBe("#fef3c7");
    expect(light["--primary-foreground"]).toBe("#000000");
    expect(contrastRatio("#fef3c7", light["--primary-foreground"])).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to the light primary for dark mode when none is given", () => {
    const { dark } = resolveAppearanceTokens({ themePrimary: "#1d4ed8" });
    expect(dark["--primary"]).toBe("#1d4ed8");
  });

  it("derives a readable foreground when a dark background is chosen", () => {
    const { light } = resolveAppearanceTokens({ themeBackground: "#0f172a" });
    expect(light["--background"]).toBe("#0f172a");
    // Body text must flip, otherwise the app becomes white-on-white.
    expect(light["--foreground"]).toBe("#ffffff");
    expect(contrastRatio("#0f172a", light["--foreground"])).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps card visibly distinct from a custom background", () => {
    for (const bg of ["#0f172a", "#fef3c7", "#ffffff", "#1d4ed8"]) {
      const { light } = resolveAppearanceTokens({ themeBackground: bg });
      expect(light["--card"], bg).toBeDefined();
      expect(light["--card"], bg).not.toBe(bg);
    }
  });

  it("ignores a malformed colour instead of interpolating it into CSS", () => {
    const { light } = resolveAppearanceTokens({
      themePrimary: "red; } body { display: none",
      themeBackground: "javascript:alert(1)",
    });
    expect(light).toEqual({});
  });

  it("clamps the radius into a sane range", () => {
    expect(resolveAppearanceTokens({ themeRadius: 99 }).light["--radius"]).toBe("2rem");
    expect(resolveAppearanceTokens({ themeRadius: -5 }).light["--radius"]).toBe("0rem");
    expect(resolveAppearanceTokens({ themeRadius: 0.5 }).light["--radius"]).toBe("0.5rem");
  });

  it("maps the default font to no override and others to their variable", () => {
    expect(resolveAppearanceTokens({ themeFont: "cairo" }).fontVar).toBeNull();
    expect(resolveAppearanceTokens({ themeFont: "tajawal" }).fontVar).toBe("--font-tajawal");
    expect(resolveAppearanceTokens({ themeFont: "plex-arabic" }).fontVar).toBe("--font-plex-arabic");
    expect(resolveAppearanceTokens({ themeFont: "almarai" }).fontVar).toBe("--font-almarai");
    expect(resolveAppearanceTokens({ themeFont: "comic-sans" }).fontVar).toBeNull();
  });

  it("every declared font variable is unique", () => {
    const vars = APPEARANCE_FONTS.map((f) => f.cssVar);
    expect(new Set(vars).size).toBe(vars.length);
  });
});

describe("buildChartRamp", () => {
  it("spaces the five series on a pentagon so no two hues collide", () => {
    // Distinctness is asserted on hue spacing + chroma rather than on WCAG
    // contrast: two same-lightness hues of different hue score ~1.0:1 on
    // luminance contrast by design, so a contrast assertion here would be a
    // false failure. A 72deg gap at this chroma is what yields the dE ~50
    // measured for the built-in ramp.
    for (const mode of ["light", "dark"] as const) {
      for (const preset of APPEARANCE_PRESETS) {
        const primary = mode === "dark" ? preset.primaryDark : preset.primary;
        const ramp = buildChartRamp(primary, mode);
        expect(ramp, `${mode}/${preset.id}`).toHaveLength(5);

        const hues = ramp.map((token) => {
          const m = /oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(token);
          expect(m, token).toBeTruthy();
          return parseFloat(m![1]);
        });
        const chromas = ramp.map((token) => parseFloat(/oklch\([\d.]+ ([\d.]+)/.exec(token)![1]));
        for (const c of chromas) expect(c, `${mode}/${preset.id} chroma`).toBeGreaterThan(0.09);

        const sorted = [...hues].sort((a, b) => a - b);
        const gaps: number[] = [];
        for (let i = 0; i < sorted.length; i++) {
          const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
          gaps.push(next - sorted[i]);
        }
        const minGap = Math.min(...gaps);
        expect(minGap, `${mode}/${preset.id} min hue gap`).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("keeps the ramp inside the displayable lightness band", () => {
    const ramp = buildChartRamp("#047857", "light");
    for (const token of ramp) {
      const l = parseFloat(/oklch\(([\d.]+)/.exec(token)![1]);
      expect(l).toBeGreaterThanOrEqual(0.42);
      expect(l).toBeLessThanOrEqual(0.85);
    }
  });
});

describe("hexToOklch", () => {
  it("maps greys to zero chroma", () => {
    expect(hexToOklch("#808080").c).toBeLessThan(0.005);
  });

  it("round-trips hue plausibly for a saturated colour", () => {
    const { c, h } = hexToOklch("#00a86b");
    expect(c).toBeGreaterThan(0.1);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it("reports the built-in emerald primary as a green", () => {
    const { h } = hexToOklch("#047857");
    expect(h).toBeGreaterThan(130);
    expect(h).toBeLessThan(180);
  });
});

describe("relativeLuminance", () => {
  it("anchors the WCAG endpoints", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("orders mid greys monotonically", () => {
    expect(relativeLuminance("#333333")).toBeLessThan(relativeLuminance("#777777"));
    expect(relativeLuminance("#777777")).toBeLessThan(relativeLuminance("#bbbbbb"));
  });
});

describe("appearanceStyleSheet", () => {
  it("renders a :root block and a .dark block", () => {
    const css = appearanceStyleSheet(resolveAppearanceTokens({ themePreset: "emerald" }));
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--primary: #047857;");
    expect(css).toContain("--radius: 0.75rem;");
  });

it("binds --font-sans to the chosen family variable", () => {
    const css = appearanceStyleSheet(resolveAppearanceTokens({ themeFont: "almarai" }));
    // Regression guard: next/font declares --font-sans on <body>, and an
    // element's own custom property beats an inherited one, so binding it on a
    // bare ":root" would emit dead CSS. The selector is pinned exactly.
    expect(css).toBe(":root body {\n  --font-sans: var(--font-almarai);\n}\n");
  });

  it("emits nothing for the default font", () => {
    const css = appearanceStyleSheet(resolveAppearanceTokens({ themeFont: "cairo" }));
    expect(css).not.toContain("--font-sans");
  });

  // Regression guard for a real defect: themeRadius was created as INTEGER, so
  // Postgres truncated every preset's fractional rem (0.5 -> 0) and the app
  // rendered square corners. The schema must stay a Float, and these bounds
  // must stay aligned with the clamp in resolveAppearanceTokens.
  it("accepts fractional rem radii and clamps out-of-range values", () => {
    const parse = appearanceSettingsSchema.parse.bind(appearanceSettingsSchema);
    expect(parse({ themeRadius: "0.5" }).themeRadius).toBe(0.5);
    expect(parse({ themeRadius: "0.375" }).themeRadius).toBe(0.375);
    expect(parse({ themeRadius: "" }).themeRadius).toBe("");
    for (const preset of APPEARANCE_PRESETS) {
      const parsed = parse({ themePreset: preset.id, themeRadius: String(preset.radius) });
      expect(parsed.themeRadius, `${preset.id} radius must survive the schema`)
        .toBe(preset.radius);
    }
    // Resolver clamps rather than throws, so the schema must not accept more.
    expect(() => parse({ themeRadius: 9 })).toThrow();
    expect(resolveAppearanceTokens({ themeRadius: 9 }).light["--radius"]).toBe("2rem");
  });

  it("rejects malformed appearance input", () => {
    expect(() => appearanceSettingsSchema.parse({ themePrimary: "#00ff" })).toThrow();
    expect(() => appearanceSettingsSchema.parse({ themePrimary: "red" })).toThrow();
    expect(() => appearanceSettingsSchema.parse({ themePreset: "chartreuse" })).toThrow();
    expect(() => appearanceSettingsSchema.parse({ themeFont: "comic-sans" })).toThrow();
  });

  it("never emits an unbalanced brace block", () => {
    const css = appearanceStyleSheet(
      resolveAppearanceTokens({
        themePreset: "rose", themeBackground: "#0f172a", themeFont: "tajawal", themeRadius: 1.25,
      }),
    );
    const open = (css.match(/\{/g) || []).length;
    const close = (css.match(/\}/g) || []).length;
    expect(open).toBe(close);
    expect(open).toBeGreaterThan(0);
  });
});