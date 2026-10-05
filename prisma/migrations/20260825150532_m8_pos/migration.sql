-- CreateTable
CREATE TABLE "pos_holds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "cash_account_id" TEXT,
    "cart" JSONB NOT NULL,
    "label" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_holds_organization_id_idx" ON "pos_holds"("organization_id");

-- CreateIndex
CREATE INDEX "pos_holds_created_by_user_id_idx" ON "pos_holds"("created_by_user_id");
