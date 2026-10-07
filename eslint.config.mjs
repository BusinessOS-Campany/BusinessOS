import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated files:
    "public/sw.js",
    // Per-org system clones: customer-owned copies of system/<slug> with their
    // own toolchain (matches tsconfig exclude).
    "orginazition/**",
    // Sub-apps live in public/ with their own toolchains (matches tsconfig exclude):
    "public/grocery/**",
    "public/muafa-store-main/**",
    "public/samaSYSTEM-main/**",
    "public/GMstore/**",
    "public/celia-main/**",
    "public/Hospital--main/**",
    "public/pharmacy/**",
    // System templates (templates + clones policy): customer-owned code with own toolchain
    "system/**",
  ]),
]);

export default eslintConfig;
