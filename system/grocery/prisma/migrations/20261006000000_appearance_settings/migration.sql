-- Appearance overrides, org-scoped on the SystemSettings singleton.
--
-- Deliberately ADDITIVE ONLY. `prisma migrate dev` on this schema also proposes
-- dropping `purchase_orders.taxTotal` and `sale_items.taxAmount` -- columns that
-- exist in the live `grocery` schema and still carry real values (4 and 525
-- non-null respectively) but are no longer declared by any model. That drift is
-- pre-existing and out of scope here; it must be resolved on purpose, never as a
-- side effect of an appearance change.
--
-- Every column is NULLABLE on purpose: NULL means "use the built-in palette
-- defined in src/app/globals.css". That keeps the shipped defaults authoritative
-- and makes "reset to default" a single UPDATE rather than a migration.
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "themePreset" TEXT,
  ADD COLUMN IF NOT EXISTS "themePrimary" TEXT,
  ADD COLUMN IF NOT EXISTS "themePrimaryDark" TEXT,
  ADD COLUMN IF NOT EXISTS "themeBackground" TEXT,
  ADD COLUMN IF NOT EXISTS "themeBackgroundDark" TEXT,
  ADD COLUMN IF NOT EXISTS "themeFont" TEXT,
  ADD COLUMN IF NOT EXISTS "themeRadius" INTEGER;