-- Profile page: public @handle + cover/banner image.
-- Additive only, and guarded with IF NOT EXISTS so it is safe to re-run.
-- Style follows the hand-authored migrations (schema-qualified, idempotent).
--
-- username is stored lower-cased by the API; the CHECK keeps that honest at the
-- database level too. It is intentionally NOT case-insensitive-unique: the API
-- rejects a taken handle with a 409 before writing, and lower-casing on write
-- means "Ahmed" and "ahmed" can never both exist through the app.
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "cover_image" TEXT;

-- Null username = account has not chosen a handle yet, which is the common
-- case, so the column must stay nullable.
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "businessos"."users" ("username");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_lowercase_chk'
  ) THEN
    ALTER TABLE "businessos"."users"
      ADD CONSTRAINT "users_username_lowercase_chk"
      CHECK ("username" IS NULL OR "username" = lower("username"));
  END IF;
END $$;
