-- Business OS Platform — App Registry Migration
-- Creates the application registry and organization app tracking tables.
-- Also adds grocery-specific extension models (brands, batches, etc.)

-- ═══════════════════════════════════════════════════════════════════════════
-- APPLICATION REGISTRY
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "description_ar" TEXT,
    "icon" TEXT,
    "category" TEXT NOT NULL DEFAULT 'business',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'active',
    "route_prefix" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "configuration_schema" JSONB,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "navigation" JSONB NOT NULL DEFAULT '[]',
    "dashboard_widgets" JSONB,
    "ai_tools" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apps_slug_key" ON "apps"("slug");

CREATE TABLE "organization_apps" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "configuration" JSONB,
    "settings" JSONB,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_apps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_apps_organization_id_app_id_key" ON "organization_apps"("organization_id", "app_id");
CREATE INDEX "organization_apps_organization_id_status_idx" ON "organization_apps"("organization_id", "status");
CREATE INDEX "organization_apps_app_id_idx" ON "organization_apps"("app_id");

ALTER TABLE "organization_apps" ADD CONSTRAINT "organization_apps_app_id_fkey"
    FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_apps" ADD CONSTRAINT "organization_apps_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add orgApps relation to organizations
ALTER TABLE "organizations" ADD COLUMN "org_apps" TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- GROCERY-SPECIFIC EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brands_organization_id_name_key" ON "brands"("organization_id", "name");
CREATE INDEX "brands_organization_id_idx" ON "brands"("organization_id");

CREATE TABLE "product_barcodes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_barcodes_organization_id_barcode_key" ON "product_barcodes"("organization_id", "barcode");
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes"("product_id");

CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "mfg_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "quantity" DECIMAL(18,3) NOT NULL,
    "cost_price" BIGINT NOT NULL DEFAULT 0,
    "supplier_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_batches_organization_id_product_id_batch_no_key" ON "product_batches"("organization_id", "product_id", "batch_no");
CREATE INDEX "product_batches_expiry_date_idx" ON "product_batches"("expiry_date");
CREATE INDEX "product_batches_product_id_expiry_date_idx" ON "product_batches"("product_id", "expiry_date");

CREATE TABLE "customer_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "discount_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "price_mode" TEXT NOT NULL DEFAULT 'retail',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_groups_organization_id_name_key" ON "customer_groups"("organization_id", "name");
CREATE INDEX "customer_groups_organization_id_idx" ON "customer_groups"("organization_id");

CREATE TABLE "customer_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_transactions_organization_id_customer_id_created_at_idx" ON "customer_transactions"("organization_id", "customer_id", "created_at");
CREATE INDEX "customer_transactions_type_idx" ON "customer_transactions"("type");

CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loyalty_transactions_organization_id_customer_id_created_at_idx" ON "loyalty_transactions"("organization_id", "customer_id", "created_at");

CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_organization_id_po_number_key" ON "purchase_orders"("organization_id", "po_number");
CREATE INDEX "purchase_orders_organization_id_supplier_id_idx" ON "purchase_orders"("organization_id", "supplier_id");
CREATE INDEX "purchase_orders_organization_id_status_idx" ON "purchase_orders"("organization_id", "status");
CREATE INDEX "purchase_orders_organization_id_order_date_idx" ON "purchase_orders"("organization_id", "order_date");

CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "received_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit_cost" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

CREATE TABLE "purchase_returns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "created_by_user_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_amount" BIGINT NOT NULL DEFAULT 0,
    "credit_amount" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_returns_organization_id_return_number_key" ON "purchase_returns"("organization_id", "return_number");
CREATE INDEX "purchase_returns_organization_id_supplier_id_idx" ON "purchase_returns"("organization_id", "supplier_id");
CREATE INDEX "purchase_returns_organization_id_date_idx" ON "purchase_returns"("organization_id", "date");

CREATE TABLE "purchase_return_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");
CREATE INDEX "purchase_return_items_product_id_idx" ON "purchase_return_items"("product_id");

CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "adjustment_number" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "previous_quantity" DECIMAL(18,3) NOT NULL,
    "new_quantity" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_adjustments_organization_id_adjustment_number_key" ON "stock_adjustments"("organization_id", "adjustment_number");
CREATE INDEX "stock_adjustments_organization_id_product_id_idx" ON "stock_adjustments"("organization_id", "product_id");
CREATE INDEX "stock_adjustments_organization_id_created_at_idx" ON "stock_adjustments"("organization_id", "created_at");
