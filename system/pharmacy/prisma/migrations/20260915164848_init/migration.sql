-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CASHIER',
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "body_ar" TEXT,
    "body_en" TEXT,
    "href" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" TEXT NOT NULL,
    "category_id" TEXT,
    "manufacturer_id" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "generic_name" TEXT,
    "brand_name" TEXT,
    "active_ingredient" TEXT,
    "strength" TEXT,
    "dosage_form" TEXT,
    "medicine_type" TEXT NOT NULL DEFAULT 'otc',
    "country_of_origin" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "min_stock" DECIMAL(18,3),
    "max_stock" DECIMAL(18,3),
    "reorder_level" DECIMAL(18,3),
    "purchase_price" BIGINT NOT NULL DEFAULT 0,
    "sale_price" BIGINT NOT NULL DEFAULT 0,
    "wholesale_price" BIGINT,
    "min_sale_price" BIGINT,
    "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "temperature_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "storage_instructions" TEXT,
    "warnings" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_batches" (
    "id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "purchase_id" TEXT,
    "batch_no" TEXT NOT NULL,
    "mfg_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "initial_qty" DECIMAL(18,3) NOT NULL,
    "remaining_qty" DECIMAL(18,3) NOT NULL,
    "purchase_price" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "type" TEXT NOT NULL,
    "qty_delta" DECIMAL(18,3) NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "adjustment_no" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "previous_qty" DECIMAL(18,3) NOT NULL,
    "new_qty" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "governorate" TEXT,
    "city" TEXT,
    "tax_number" TEXT,
    "payment_terms" TEXT,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "amount" BIGINT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "phone" TEXT,
    "clinic" TEXT,
    "hospital" TEXT,
    "license_no" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "branch_id" TEXT,
    "salary" BIGINT,
    "hire_date" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3),
    "received_date" TIMESTAMP(3),
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "paid_total" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "received_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit_cost" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" TEXT,
    "doctor_id" TEXT,
    "prescription_id" TEXT,
    "warehouse_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "paid_total" BIGINT NOT NULL DEFAULT 0,
    "payment_method" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "line_subtotal" BIGINT NOT NULL,
    "line_tax" BIGINT NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,
    "unit_cost" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "cash_account_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
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
    "medicine_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "total" BIGINT NOT NULL,
    "refund_amount" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_items" (
    "id" TEXT NOT NULL,
    "supplier_return_id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "prescription_no" TEXT NOT NULL,
    "customer_id" TEXT,
    "doctor_id" TEXT,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "medicine_id" TEXT,
    "medicine_name" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "quantity" DECIMAL(18,3),
    "dispensed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category_id" TEXT,
    "amount" BIGINT NOT NULL,
    "description" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "cash_account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opening_balance" BIGINT NOT NULL DEFAULT 0,
    "closing_balance" BIGINT,
    "actual_balance" BIGINT,
    "discrepancy" BIGINT DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "cash_account_id" TEXT NOT NULL,
    "session_id" TEXT,
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
CREATE TABLE "numberSequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "numberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_holds" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "warehouse_id" TEXT,
    "cart" JSONB NOT NULL,
    "label" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "branches_is_active_idx" ON "branches"("is_active");

-- CreateIndex
CREATE INDEX "warehouses_branch_id_idx" ON "warehouses"("branch_id");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "medicines_name_ar_idx" ON "medicines"("name_ar");

-- CreateIndex
CREATE INDEX "medicines_category_id_idx" ON "medicines"("category_id");

-- CreateIndex
CREATE INDEX "medicines_manufacturer_id_idx" ON "medicines"("manufacturer_id");

-- CreateIndex
CREATE INDEX "medicines_is_active_idx" ON "medicines"("is_active");

-- CreateIndex
CREATE INDEX "medicines_medicine_type_idx" ON "medicines"("medicine_type");

-- CreateIndex
CREATE INDEX "medicines_dosage_form_idx" ON "medicines"("dosage_form");

-- CreateIndex
CREATE UNIQUE INDEX "medicines_sku_key" ON "medicines"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "medicines_barcode_key" ON "medicines"("barcode");

-- CreateIndex
CREATE INDEX "medicine_batches_medicine_id_expiry_date_idx" ON "medicine_batches"("medicine_id", "expiry_date");

-- CreateIndex
CREATE INDEX "medicine_batches_expiry_date_idx" ON "medicine_batches"("expiry_date");

-- CreateIndex
CREATE INDEX "medicine_batches_status_idx" ON "medicine_batches"("status");

-- CreateIndex
CREATE INDEX "medicine_batches_supplier_id_idx" ON "medicine_batches"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_batches_medicine_id_batch_no_key" ON "medicine_batches"("medicine_id", "batch_no");

-- CreateIndex
CREATE INDEX "stock_levels_warehouse_id_idx" ON "stock_levels"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_medicine_id_warehouse_id_key" ON "stock_levels"("medicine_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_movements_medicine_id_warehouse_id_created_at_idx" ON "inventory_movements"("medicine_id", "warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_ref_type_ref_id_idx" ON "inventory_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "inventory_movements_batch_id_idx" ON "inventory_movements"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_adjustment_no_key" ON "stock_adjustments"("adjustment_no");

-- CreateIndex
CREATE INDEX "stock_adjustments_medicine_id_idx" ON "stock_adjustments"("medicine_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_created_at_idx" ON "stock_adjustments"("created_at");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_created_at_idx" ON "supplier_payments"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "supplier_payments_purchase_id_idx" ON "supplier_payments"("purchase_id");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "doctors_is_active_idx" ON "doctors"("is_active");

-- CreateIndex
CREATE INDEX "employees_is_active_idx" ON "employees"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_order_date_idx" ON "purchase_orders"("order_date");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_order_id_idx" ON "purchase_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_items_medicine_id_idx" ON "purchase_items"("medicine_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_invoice_number_key" ON "sales_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "sales_invoices_issued_at_idx" ON "sales_invoices"("issued_at");

-- CreateIndex
CREATE INDEX "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sales_invoices_doctor_id_idx" ON "sales_invoices"("doctor_id");

-- CreateIndex
CREATE INDEX "sales_invoices_status_idx" ON "sales_invoices"("status");

-- CreateIndex
CREATE INDEX "sales_invoices_prescription_id_idx" ON "sales_invoices"("prescription_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_invoice_id_idx" ON "sales_invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_medicine_id_idx" ON "sales_invoice_items"("medicine_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_batch_id_idx" ON "sales_invoice_items"("batch_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_cash_account_id_idx" ON "payments"("cash_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_return_number_key" ON "sales_returns"("return_number");

-- CreateIndex
CREATE INDEX "sales_returns_invoice_id_idx" ON "sales_returns"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_return_items_return_id_idx" ON "sales_return_items"("return_id");

-- CreateIndex
CREATE INDEX "sales_return_items_medicine_id_idx" ON "sales_return_items"("medicine_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_return_number_key" ON "supplier_returns"("return_number");

-- CreateIndex
CREATE INDEX "supplier_returns_supplier_id_idx" ON "supplier_returns"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_returns_created_at_idx" ON "supplier_returns"("created_at");

-- CreateIndex
CREATE INDEX "supplier_return_items_supplier_return_id_idx" ON "supplier_return_items"("supplier_return_id");

-- CreateIndex
CREATE INDEX "supplier_return_items_medicine_id_idx" ON "supplier_return_items"("medicine_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_prescription_no_key" ON "prescriptions"("prescription_no");

-- CreateIndex
CREATE INDEX "prescriptions_customer_id_idx" ON "prescriptions"("customer_id");

-- CreateIndex
CREATE INDEX "prescriptions_doctor_id_idx" ON "prescriptions"("doctor_id");

-- CreateIndex
CREATE INDEX "prescriptions_status_idx" ON "prescriptions"("status");

-- CreateIndex
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_paid_at_idx" ON "expenses"("paid_at");

-- CreateIndex
CREATE INDEX "cash_sessions_cash_account_id_status_idx" ON "cash_sessions"("cash_account_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_user_id_idx" ON "cash_sessions"("user_id");

-- CreateIndex
CREATE INDEX "cash_movements_cash_account_id_created_at_idx" ON "cash_movements"("cash_account_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_session_id_idx" ON "cash_movements"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "numberSequence_key_key" ON "numberSequence"("key");

-- CreateIndex
CREATE INDEX "pos_holds_created_by_user_id_idx" ON "pos_holds"("created_by_user_id");
