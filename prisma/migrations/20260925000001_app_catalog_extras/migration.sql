-- Self-service system catalog extras (req: image + database/schema identifier).
-- Additive only: no data touched, IF NOT EXISTS guards for drifted databases.
ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "schema_key" TEXT;
