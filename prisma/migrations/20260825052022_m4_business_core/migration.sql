-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "short_ar" TEXT,
    "short_en" TEXT,
    "factor" DECIMAL(18,6) NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_id" TEXT,
    "base_unit_id" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "cost_price" BIGINT NOT NULL DEFAULT 0,
    "sale_price" BIGINT NOT NULL DEFAULT 0,
    "wholesale_price" BIGINT,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "track_stock" BOOLEAN NOT NULL DEFAULT true,
    "min_stock" DECIMAL(65,30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "nameEn" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name_ar" TEXT NOT NULL,
    "nameEn" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "qty_delta" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "nameEn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_id" TEXT,
    "amount" BIGINT NOT NULL,
    "cash_account_id" TEXT,
    "note" TEXT,
    "spent_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "opening_balance" BIGINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "delta" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT,
    "warehouse_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "paid_total" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_bps" INTEGER NOT NULL,
    "line_subtotal" BIGINT NOT NULL,
    "line_tax" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,
    "unit_cost" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "cash_account_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" TEXT,
    "warehouse_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "subtotal" BIGINT NOT NULL,
    "tax_total" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "paid_total" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" BIGINT NOT NULL,
    "tax_rate_bps" INTEGER NOT NULL,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "total" BIGINT NOT NULL,
    "refunded" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_organization_id_idx" ON "categories"("organization_id");

-- CreateIndex
CREATE INDEX "units_organization_id_idx" ON "units"("organization_id");

-- CreateIndex
CREATE INDEX "products_organization_id_name_ar_idx" ON "products"("organization_id", "name_ar");

-- CreateIndex
CREATE INDEX "products_organization_id_is_active_idx" ON "products"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_barcode_key" ON "products"("organization_id", "barcode");

-- CreateIndex
CREATE INDEX "branches_organization_id_idx" ON "branches"("organization_id");

-- CreateIndex
CREATE INDEX "warehouses_organization_id_idx" ON "warehouses"("organization_id");

-- CreateIndex
CREATE INDEX "stock_levels_organization_id_warehouse_id_idx" ON "stock_levels"("organization_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_product_id_warehouse_id_key" ON "stock_levels"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_product_id_warehouse_id_cre_idx" ON "stock_movements"("organization_id", "product_id", "warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_ref_type_ref_id_idx" ON "stock_movements"("organization_id", "ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_name_idx" ON "customers"("organization_id", "name");

-- CreateIndex
CREATE INDEX "customers_organization_id_phone_idx" ON "customers"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_name_idx" ON "suppliers"("organization_id", "name");

-- CreateIndex
CREATE INDEX "expense_categories_organization_id_idx" ON "expense_categories"("organization_id");

-- CreateIndex
CREATE INDEX "expenses_organization_id_spent_at_idx" ON "expenses"("organization_id", "spent_at");

-- CreateIndex
CREATE INDEX "cash_accounts_organization_id_idx" ON "cash_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "cash_movements_organization_id_account_id_created_at_idx" ON "cash_movements"("organization_id", "account_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_organization_id_ref_type_ref_id_idx" ON "cash_movements"("organization_id", "ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_organization_id_key_key" ON "number_sequences"("organization_id", "key");

-- CreateIndex
CREATE INDEX "sales_invoices_organization_id_issued_at_idx" ON "sales_invoices"("organization_id", "issued_at");

-- CreateIndex
CREATE INDEX "sales_invoices_organization_id_customer_id_idx" ON "sales_invoices"("organization_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_organization_id_number_key" ON "sales_invoices"("organization_id", "number");

-- CreateIndex
CREATE INDEX "sales_invoice_items_invoice_id_idx" ON "sales_invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_organization_id_product_id_idx" ON "sales_invoice_items"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_created_at_idx" ON "payments"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "purchases_organization_id_issued_at_idx" ON "purchases"("organization_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_organization_id_number_key" ON "purchases"("organization_id", "number");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "sales_returns_organization_id_invoice_id_idx" ON "sales_returns"("organization_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_organization_id_number_key" ON "sales_returns"("organization_id", "number");

-- CreateIndex
CREATE INDEX "sales_return_items_return_id_idx" ON "sales_return_items"("return_id");
