"use client";

import { useState } from "react";
import { toast } from "sonner";
import { translateKey } from "@/lib/client-i18n";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = (key: string) => translateKey(locale, key);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/pharmacy/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
    toast.success(t("auth.resetLinkSent"));
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetPassword")}</CardTitle>
          <CardDescription>{t("auth.enterEmail")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-sm text-muted-foreground">{t("auth.resetLinkSent")}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {t("auth.sendResetLink")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <div className="mt-4 text-center">
        <a href="/login" className="text-sm text-primary hover:underline">
          {t("auth.backToLogin")}
        </a>
      </div>
    </div>
  );
}