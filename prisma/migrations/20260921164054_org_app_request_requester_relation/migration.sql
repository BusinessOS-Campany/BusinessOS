-- AddForeignKey
ALTER TABLE "organization_app_requests" ADD CONSTRAINT "organization_app_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
