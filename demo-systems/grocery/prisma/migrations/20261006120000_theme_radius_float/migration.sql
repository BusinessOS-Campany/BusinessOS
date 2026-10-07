-- Correct themeRadius from INTEGER to DOUBLE PRECISION.
--
-- The column was created as INTEGER, but --radius is consumed in rem units and
-- the shipped presets use fractions (0.375, 0.5, 0.625, 0.75, 1.25). Postgres
-- truncated 0.5 to 0, so selecting a preset silently produced a square-cornered
-- app. Widening the type is lossless for existing values.
ALTER TABLE "system_settings"
  ALTER COLUMN "themeRadius" TYPE DOUBLE PRECISION;