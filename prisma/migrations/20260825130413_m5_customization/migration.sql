-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "rules" JSONB,
    "is_unique" BOOLEAN NOT NULL DEFAULT false,
    "has_index" BOOLEAN NOT NULL DEFAULT false,
    "is_encrypted" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "value_text" TEXT,
    "value_number" DOUBLE PRECISION,
    "value_date" TIMESTAMP(3),
    "value_bool" BOOLEAN,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "layout" JSONB NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_fields_organization_id_entity_type_is_active_idx" ON "custom_fields"("organization_id", "entity_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_organization_id_entity_type_key_key" ON "custom_fields"("organization_id", "entity_type", "key");

-- CreateIndex
CREATE INDEX "custom_field_values_organization_id_entity_type_entity_id_idx" ON "custom_field_values"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "custom_field_values_field_id_value_text_idx" ON "custom_field_values"("field_id", "value_text");

-- CreateIndex
CREATE INDEX "custom_field_values_field_id_value_number_idx" ON "custom_field_values"("field_id", "value_number");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_field_id_entity_id_key" ON "custom_field_values"("field_id", "entity_id");

-- CreateIndex
CREATE INDEX "saved_views_organization_id_entity_type_idx" ON "saved_views"("organization_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_organization_id_user_id_key" ON "dashboard_layouts"("organization_id", "user_id");
