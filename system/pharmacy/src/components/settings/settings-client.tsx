"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2, Landmark, Save, Store, Warehouse as WarehouseIcon } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveSettings } from "@/lib/actions/account";

export function SettingsClient({
  locale,
  pharmacy,
  branches,
  warehouses,
  cashAccounts,
}: {
  locale: Locale;
  pharmacy: { nameAr: string; nameEn: string; phone: string; email: string; address: string; taxNumber: string; taxRateBps: number; expiryWarningDays: number };
  branches: Array<{ id: string; name: string; isActive: boolean }>;
  warehouses: Array<{ id: string; name: string; isMain: boolean; isActive: boolean }>;
  cashAccounts: Array<{ id: string; name: string; type: string; isActive: boolean }>;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(pharmacy);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    startTransition(async () => {
      try {
        await saveSettings({ ...form });
        toast.success(t("common.saved"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  const section = (icon: React.ReactNode, title: string, children: React.ReactNode) => (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        {icon}
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "الإعدادات" : "Settings"}
        description={locale === "ar" ? "بيانات الصيدلية والفرع والمستودعات" : "Pharmacy, branch and warehouse info"}
        actions={<Button onClick={submit} disabled={pending}><Save /> {t("common.save")}</Button>}
      />

      {section(<Store />, locale === "ar" ? "بيانات الصيدلية" : "Pharmacy info", (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{locale === "ar" ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "الهاتف" : "Phone"}</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{locale === "ar" ? "العنوان" : "Address"}</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "الرقم الضريبي" : "Tax number"}</Label>
            <Input value={form.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "ضريبة المبيعات (%)" : "Sales tax (%)"}</Label>
            <Input type="number" step="0.01" value={form.taxRateBps / 100} onChange={(e) => set("taxRateBps", Math.round(Number(e.target.value) * 100))} />
          </div>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "تنبيه انتهاء الصلاحية (أيام)" : "Expiry warning (days)"}</Label>
            <Input type="number" value={form.expiryWarningDays} onChange={(e) => set("expiryWarningDays", Number(e.target.value))} />
          </div>
        </div>
      ))}

      {section(<Building2 />, locale === "ar" ? "الفروع" : "Branches", (
        <div className="space-y-2">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{b.name}</span>
              <Badge variant={b.isActive ? "success" : "secondary"}>{b.isActive ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "موقوف" : "Inactive")}</Badge>
            </div>
          ))}
        </div>
      ))}

      {section(<WarehouseIcon />, locale === "ar" ? "المستودعات" : "Warehouses", (
        <div className="space-y-2">
          {warehouses.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{w.name} {w.isMain ? <Badge variant="default" className="ms-1">{locale === "ar" ? "رئيسي" : "Main"}</Badge> : null}</span>
              <Badge variant={w.isActive ? "success" : "secondary"}>{w.isActive ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "موقوف" : "Inactive")}</Badge>
            </div>
          ))}
        </div>
      ))}

      {section(<Landmark />, locale === "ar" ? "الصناديق النقدية" : "Cash accounts", (
        <div className="space-y-2">
          {cashAccounts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{c.name}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{c.type}</Badge>
                <Badge variant={c.isActive ? "success" : "secondary"}>{c.isActive ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "موقوف" : "Inactive")}</Badge>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}