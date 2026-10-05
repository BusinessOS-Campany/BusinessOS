-- Add username column for username-based login
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill usernames from existing emails before adding unique constraint
UPDATE "User" SET "username" = lower(split_part("email", '@', 1));

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");