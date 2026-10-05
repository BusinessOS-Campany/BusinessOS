/*
  Warnings:

  - You are about to drop the column `org_apps` on the `organizations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "org_apps";

-- CreateTable
CREATE TABLE "organization_app_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "planCode" TEXT,
    "note" TEXT,
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_app_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_patients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "serial_number" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT,
    "gender" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "exam_type" TEXT,
    "price" BIGINT NOT NULL DEFAULT 0,
    "payment_method" TEXT,
    "wallet_type" TEXT,
    "transaction_number" TEXT,
    "registration_date" TIMESTAMP(3),
    "notes" TEXT,
    "special" TEXT,
    "status" TEXT NOT NULL DEFAULT 'progress',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_services" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "price" BIGINT NOT NULL,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_employees" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT,
    "salary" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "session_type" TEXT NOT NULL DEFAULT 'normal',
    "special" TEXT,
    "status" TEXT NOT NULL DEFAULT 'progress',
    "session_date" TIMESTAMP(3),
    "price" BIGINT,
    "notes" TEXT,
    "payment_method" TEXT,
    "wallet_type" TEXT,
    "transaction_number" TEXT,
    "prepaid" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_appointments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "phone" TEXT,
    "therapist" TEXT,
    "date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_advances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "specialty" TEXT,
    "amount" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_coverages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "session_type" TEXT NOT NULL DEFAULT 'normal',
    "date" TIMESTAMP(3) NOT NULL,
    "price" BIGINT NOT NULL,
    "therapist_share" BIGINT NOT NULL DEFAULT 50000,
    "from" TEXT,
    "to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sama_calendar_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sama_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_app_requests_organization_id_status_idx" ON "organization_app_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "organization_app_requests_status_created_at_idx" ON "organization_app_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_app_requests_organization_id_app_id_key" ON "organization_app_requests"("organization_id", "app_id");

-- CreateIndex
CREATE INDEX "sama_patients_organization_id_is_active_idx" ON "sama_patients"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "sama_patients_organization_id_phone_idx" ON "sama_patients"("organization_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "sama_patients_organization_id_serial_number_key" ON "sama_patients"("organization_id", "serial_number");

-- CreateIndex
CREATE INDEX "sama_services_organization_id_is_active_idx" ON "sama_services"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "sama_services_organization_id_name_key" ON "sama_services"("organization_id", "name");

-- CreateIndex
CREATE INDEX "sama_employees_organization_id_is_active_idx" ON "sama_employees"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "sama_sessions_organization_id_status_idx" ON "sama_sessions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "sama_sessions_organization_id_session_date_idx" ON "sama_sessions"("organization_id", "session_date");

-- CreateIndex
CREATE INDEX "sama_appointments_organization_id_date_idx" ON "sama_appointments"("organization_id", "date");

-- CreateIndex
CREATE INDEX "sama_appointments_organization_id_status_idx" ON "sama_appointments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "sama_advances_organization_id_date_idx" ON "sama_advances"("organization_id", "date");

-- CreateIndex
CREATE INDEX "sama_coverages_organization_id_date_idx" ON "sama_coverages"("organization_id", "date");

-- CreateIndex
CREATE INDEX "sama_coverages_organization_id_employee_name_idx" ON "sama_coverages"("organization_id", "employee_name");

-- CreateIndex
CREATE INDEX "sama_calendar_events_organization_id_date_idx" ON "sama_calendar_events"("organization_id", "date");

-- AddForeignKey
ALTER TABLE "organization_app_requests" ADD CONSTRAINT "organization_app_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_app_requests" ADD CONSTRAINT "organization_app_requests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "customer_transactions_organization_id_customer_id_created_at_id" RENAME TO "customer_transactions_organization_id_customer_id_created_a_idx";
