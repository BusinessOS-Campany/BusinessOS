-- The password a member uses INSIDE one organization's own copy of a system.
--
-- Additive only, guarded with IF NOT EXISTS so it is safe to re-run, and written
-- schema-qualified like the other hand-authored migrations in this repo.
--
-- Why this table exists: each org owns a private copy of a system
-- (`system/<slug>/` cloned into `orginazition/<org>/systems/<slug>/`) and that
-- copy has its own database with its own `users` table, which the platform
-- cannot read. The platform holds Better Auth's scrypt hash in
-- `accounts.password`; no cloned system can verify that, and scrypt cannot be
-- converted to bcrypt. So at signup and at every password change the platform
-- also stores a bcrypt-12 digest here and pushes it into the clone's
-- `users.passwordHash`, which is what lets one email+password work on both sides.
--
-- No plaintext, ever: `password_hash` holds a bcrypt digest and nothing else.
CREATE TABLE IF NOT EXISTS "businessos"."system_credentials" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "app_id"          TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "username"        TEXT NOT NULL,
  "password_hash"   TEXT NOT NULL,
  "synced_at"       TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_credentials_pkey" PRIMARY KEY ("id")
);

-- One digest per person per org per system: the same user in two orgs has two
-- rows, and re-confirming replaces rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "system_credentials_org_app_user_key"
  ON "businessos"."system_credentials" ("organization_id", "app_id", "user_id");

-- Re-push after a password change walks every row for that user.
CREATE INDEX IF NOT EXISTS "system_credentials_user_id_idx"
  ON "businessos"."system_credentials" ("user_id");

-- Pushing one org's members on boot walks every row for that org + app.
CREATE INDEX IF NOT EXISTS "system_credentials_org_app_idx"
  ON "businessos"."system_credentials" ("organization_id", "app_id");

-- Foreign keys are omitted deliberately: this repo's business tables use plain
-- FK columns with manual child writes (see AGENTS.md), and the application
-- deletes an org's credentials explicitly in the same transaction that removes
-- the org.
