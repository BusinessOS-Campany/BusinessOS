-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_cash_account_id_idx" ON "expenses"("cash_account_id");

-- CreateIndex
CREATE INDEX "payments_cash_account_id_idx" ON "payments"("cash_account_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items"("product_id");

-- CreateIndex
CREATE INDEX "purchases_organization_id_supplier_id_idx" ON "purchases"("organization_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchases_organization_id_status_idx" ON "purchases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "sales_invoices_organization_id_warehouse_id_idx" ON "sales_invoices"("organization_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "sales_invoices_organization_id_status_issued_at_idx" ON "sales_invoices"("organization_id", "status", "issued_at");

-- CreateIndex
CREATE INDEX "sales_return_items_product_id_idx" ON "sales_return_items"("product_id");

-- CreateIndex
CREATE INDEX "saved_views_user_id_idx" ON "saved_views"("user_id");

-- CreateIndex
CREATE INDEX "sessions_active_organization_id_idx" ON "sessions"("active_organization_id");

-- CreateIndex
CREATE INDEX "warehouses_branch_id_idx" ON "warehouses"("branch_id");
