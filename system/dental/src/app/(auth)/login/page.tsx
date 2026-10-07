import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n-server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signIn };
}

export default function LoginPage() {
  return (
    <div className="flex w-full items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}