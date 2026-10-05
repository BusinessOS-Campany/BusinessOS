-- Profile-extended user fields (Business OS M-extra: user profile system).
-- Additive only — safe to run repeatedly / against live data.
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'ar';
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "preferences" JSONB;