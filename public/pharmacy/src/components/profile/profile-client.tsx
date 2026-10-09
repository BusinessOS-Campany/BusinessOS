"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Save, UserRound } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_NAME, ROLE_NAME_AR } from "@/lib/permissions";
import { updateProfile, changePassword } from "@/lib/actions/account";

export function ProfileClient({ locale, user }: {
  locale: Locale;
  user: { username: string; name: string; nameAr: string; email: string; phone: string; role: string };
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: user.name, nameAr: user.nameAr, phone: user.phone });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });

  function saveProfile() {
    if (!form.name.trim()) {
      toast.error(locale === "ar" ? "الاسم مطلوب" : "Name is required");
      return;
    }
    startTransition(async () => {
      try {
        await updateProfile(form);
        toast.success(t("common.saved"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function savePassword() {
    if (pw.newPassword.length < 6) {
      toast.error(locale === "ar" ? "كلمة المرور 6 أحرف على الأقل" : "Password must be at least 6 characters");
      return;
    }
    if (pw.newPassword !== pw.confirm) {
      toast.error(locale === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }
    startTransition(async () => {
      try {
        await changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
        toast.success(locale === "ar" ? "تم تغيير كلمة المرور" : "Password changed");
        setPw({ currentPassword: "", newPassword: "", confirm: "" });
      } catch (e) {
        toast.error(e instanceof Error && e.message === "WRONG_PASSWORD" ? (locale === "ar" ? "كلمة المرور الحالية خاطئة" : "Wrong current password") : t("common.unpublished"));
      }
    });
  }

  const roleLabel =
    user.role in ROLE_NAME_AR
      ? locale === "ar"
        ? ROLE_NAME_AR[user.role as keyof typeof ROLE_NAME_AR]
        : ROLE_NAME[user.role as keyof typeof ROLE_NAME]
      : user.role;

  return (
    <div className="space-y-6">
      <PageHeader title={locale === "ar" ? "الملف الشخصي" : "Profile"} description={`@${user.username}`} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{locale === "ar" ? "البيانات الشخصية" : "Personal info"}</CardTitle>
            <Badge variant="secondary" className="ms-auto">{roleLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الهاتف" : "Phone"}</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
              <Input value={user.email} disabled />
            </div>
            <Button onClick={saveProfile} disabled={pending}><Save /> {locale === "ar" ? "حفظ" : "Save"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{locale === "ar" ? "تغيير كلمة المرور" : "Change password"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "كلمة المرور الحالية" : "Current password"}</Label>
              <Input type="password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "كلمة المرور الجديدة" : "New password"}</Label>
              <Input type="password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "تأكيد كلمة المرور" : "Confirm new password"}</Label>
              <Input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
            </div>
            <Button variant="outline" onClick={savePassword} disabled={pending}><Save /> {locale === "ar" ? "تغيير كلمة المرور" : "Update password"}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}