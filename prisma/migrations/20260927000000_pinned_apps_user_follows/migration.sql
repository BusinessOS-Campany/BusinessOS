-- pinnings + social follow graph declared in schema.prisma but never created by any
-- migration (marketplace favorites 500'd on "table businessos.pinned_apps does not exist").
-- Additive only: two new tables, no existing table touched.
CREATE TABLE IF NOT EXISTS "businessos"."pinned_apps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_apps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "businessos"."user_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pinned_apps_app_id_idx" ON "businessos"."pinned_apps"("app_id");

CREATE UNIQUE INDEX IF NOT EXISTS "pinned_apps_user_id_app_id_key" ON "businessos"."pinned_apps"("user_id", "app_id");

CREATE INDEX IF NOT EXISTS "user_follows_following_id_idx" ON "businessos"."user_follows"("following_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_follows_follower_id_following_id_key" ON "businessos"."user_follows"("follower_id", "following_id");

ALTER TABLE "businessos"."pinned_apps" ADD CONSTRAINT "pinned_apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "businessos"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "businessos"."pinned_apps" ADD CONSTRAINT "pinned_apps_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "businessos"."apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "businessos"."user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "businessos"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "businessos"."user_follows" ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "businessos"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
