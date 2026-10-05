import { requireAuth } from "@/lib/dal";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  return <AppShell user={user}>{children}</AppShell>;
}