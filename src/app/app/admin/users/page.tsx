import { requireTenantPage } from "@/core/tenancy/page-guard";
import { UsersManager } from "./users-manager";

export default async function TenantUsersPage() {
  await requireTenantPage({ users: ["read"] });
  return <UsersManager />;
}
