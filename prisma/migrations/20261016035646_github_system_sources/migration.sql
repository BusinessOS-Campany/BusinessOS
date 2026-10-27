-- DropIndex
DROP INDEX "users_country_code_idx";

-- AlterTable
ALTER TABLE "system_credentials" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "github_installations" (
    "id" INTEGER NOT NULL,
    "account_login" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "repository_selection" TEXT NOT NULL DEFAULT 'all',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_sources" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "repo_id" TEXT,
    "repo_full_name" TEXT NOT NULL,
    "installation_id" INTEGER NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "category" TEXT NOT NULL DEFAULT 'business',
    "framework" TEXT,
    "package_manager" TEXT NOT NULL DEFAULT 'npm',
    "build_config" JSONB NOT NULL DEFAULT '{}',
    "setup_sql" TEXT,
    "last_commit_sha" TEXT,
    "last_commit_message" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_env_vars" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_enc" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_env_vars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_deployments" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "commit_message" TEXT,
    "ref" TEXT NOT NULL DEFAULT 'main',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "created_by_user_id" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "system_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_deployment_orgs" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "previous_sha" TEXT,
    "error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_deployment_orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_logs" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT,
    "slug" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "repo_full_name" TEXT,
    "action" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "detail" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_sources_slug_key" ON "system_sources"("slug");

-- CreateIndex
CREATE INDEX "system_sources_installation_id_idx" ON "system_sources"("installation_id");

-- CreateIndex
CREATE INDEX "system_sources_archived_idx" ON "system_sources"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "system_env_vars_slug_key_key" ON "system_env_vars"("slug", "key");

-- CreateIndex
CREATE INDEX "system_deployments_slug_queued_at_idx" ON "system_deployments"("slug", "queued_at");

-- CreateIndex
CREATE INDEX "system_deployments_status_idx" ON "system_deployments"("status");

-- CreateIndex
CREATE INDEX "system_deployment_orgs_organization_id_idx" ON "system_deployment_orgs"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_deployment_orgs_deployment_id_organization_id_key" ON "system_deployment_orgs"("deployment_id", "organization_id");

-- CreateIndex
CREATE INDEX "deployment_logs_deployment_id_created_at_idx" ON "deployment_logs"("deployment_id", "created_at");

-- CreateIndex
CREATE INDEX "deployment_logs_slug_created_at_idx" ON "deployment_logs"("slug", "created_at");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_repo_full_name_received_at_idx" ON "github_webhook_deliveries"("repo_full_name", "received_at");

-- AddForeignKey
ALTER TABLE "system_credentials" ADD CONSTRAINT "system_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_credentials" ADD CONSTRAINT "system_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_credentials" ADD CONSTRAINT "system_credentials_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_sources" ADD CONSTRAINT "system_sources_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "github_installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_env_vars" ADD CONSTRAINT "system_env_vars_slug_fkey" FOREIGN KEY ("slug") REFERENCES "system_sources"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_deployments" ADD CONSTRAINT "system_deployments_slug_fkey" FOREIGN KEY ("slug") REFERENCES "system_sources"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_deployment_orgs" ADD CONSTRAINT "system_deployment_orgs_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "system_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "system_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "system_credentials_org_app_idx" RENAME TO "system_credentials_organization_id_app_id_idx";

-- RenameIndex
ALTER INDEX "system_credentials_org_app_user_key" RENAME TO "system_credentials_organization_id_app_id_user_id_key";
