"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Milestone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = (key: string) => translateKey(locale, key);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/pharmacy/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "invalid" ? t("auth.invalidCredentials") : t("auth.accountDisabled"));
        setLoading(false);
        return;
      }
      toast.success(t("auth.welcomeBack") + "، " + data.name);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("auth.invalidCredentials"));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <Milestone className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">{t("auth.loginTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.loginSubtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("auth.signIn")}</CardTitle>
          <CardDescription>
            {locale === "ar" ? "أدخل بيانات الدخول الخاصة بك" : "Enter your credentials"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <a href="/pharmacy/forgot-password" className="text-xs text-primary hover:underline">
                  {t("auth.forgotPassword")}
                </a>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className={cn("w-full")} disabled={loading}>
              {loading ? (locale === "ar" ? "جاري الدخول..." : "Signing in...") : t("auth.signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}