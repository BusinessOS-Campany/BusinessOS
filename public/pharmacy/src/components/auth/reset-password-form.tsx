"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { translateKey } from "@/lib/client-i18n";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ locale, token }: { locale: Locale; token: string }) {
  const t = (key: string) => translateKey(locale, key);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsDontMatch"));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/pharmacy/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error === "invalid" ? t("auth.resetLinkSent") : t("common.unpublished"));
      setLoading(false);
      return;
    }
    toast.success(t("auth.passwordChanged"));
    router.push("/login");
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.createNewPassword")}</CardTitle>
          <CardDescription>{t("auth.resetPassword")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.newPassword")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {t("auth.reset")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}