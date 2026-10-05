-- CreateTable
CREATE TABLE "sync_devices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "platform" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_queue" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "local_value" JSONB NOT NULL,
    "remote_value" JSONB NOT NULL,
    "local_updated_at" TIMESTAMP(3),
    "remote_updated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_value" JSONB,
    "resolved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "conflict_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_devices_organization_id_user_id_idx" ON "sync_devices"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_devices_organization_id_user_id_fingerprint_key" ON "sync_devices"("organization_id", "user_id", "fingerprint");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_organization_id_key_key" ON "idempotency_keys"("organization_id", "key");

-- CreateIndex
CREATE INDEX "conflict_queue_organization_id_entity_type_status_idx" ON "conflict_queue"("organization_id", "entity_type", "status");

-- CreateIndex
CREATE INDEX "conflict_queue_organization_id_entity_id_idx" ON "conflict_queue"("organization_id", "entity_id");
