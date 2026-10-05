-- Missing user profile columns (schema.prisma has privacy/profileExtras/socials, migration 20260924 only added bio/phone/locale/preferences).
-- Additive only — safe to run repeatedly / against live data.
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "privacy" JSONB;
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "profile_extras" JSONB;
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "socials" JSONB;
