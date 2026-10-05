import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="flex w-full items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}