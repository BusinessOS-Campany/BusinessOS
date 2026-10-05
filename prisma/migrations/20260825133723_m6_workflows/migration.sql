-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "next_run_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_event" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "event_id" TEXT,
    "status" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "result" JSONB,
    "duration_ms" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "Signing_key" TEXT,
    "events" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "title_ar" TEXT,
    "title_en" TEXT,
    "body_ar" TEXT,
    "body_en" TEXT,
    "href" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_status_next_run_at_idx" ON "outbox_events"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_event_type_idx" ON "outbox_events"("organization_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_organization_id_dedupe_key_key" ON "outbox_events"("organization_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "workflow_rules_organization_id_trigger_event_is_active_idx" ON "workflow_rules"("organization_id", "trigger_event", "is_active");

-- CreateIndex
CREATE INDEX "workflow_executions_organization_id_rule_id_created_at_idx" ON "workflow_executions"("organization_id", "rule_id", "created_at");

-- CreateIndex
CREATE INDEX "workflow_executions_organization_id_status_idx" ON "workflow_executions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "webhook_endpoints_organization_id_is_active_idx" ON "webhook_endpoints"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "notifications_organization_id_user_id_is_read_idx" ON "notifications"("organization_id", "user_id", "is_read");
