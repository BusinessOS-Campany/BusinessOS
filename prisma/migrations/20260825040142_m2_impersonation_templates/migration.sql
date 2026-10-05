-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organization_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "settings" JSONB,
ADD COLUMN     "template_code" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "impersonated_by" TEXT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
