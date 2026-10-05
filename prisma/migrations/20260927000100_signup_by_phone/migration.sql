-- Signup by phone number.
--
-- Two changes to "businessos"."users":
--   1. "email" drops NOT NULL, so an account can be identified by phone instead.
--   2. "phone" gains a UNIQUE index, and a new "country_code" column is added.
--
-- Safety notes, because this is the first migration that mutates an existing
-- populated table (243 users at the time of writing):
--
--   * Relaxing NOT NULL is additive. No row is rewritten and no existing user
--     loses data; every current row keeps its email.
--   * Postgres treats NULLs as distinct in a unique index, and every current
--     "phone" is NULL, so this index cannot collide with existing data.
--   * The two UNIQUE constraints are independent, so the same string could in
--     principle be one user's email and another user's phone. That is prevented
--     in the signup route (it checks both columns), not by the database, which
--     cannot express a cross-column constraint.
--
-- "exactly one of email/phone is set" is likewise an application-level rule:
-- CHECK constraints cannot be added to an existing table without a full table
-- rewrite, so the signup route is the enforcement point.

ALTER TABLE "businessos"."users" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "businessos"."users" ADD COLUMN IF NOT EXISTS "country_code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "businessos"."users"("phone");

CREATE INDEX IF NOT EXISTS "users_country_code_idx" ON "businessos"."users"("country_code");
