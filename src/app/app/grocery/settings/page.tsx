"use client";

import { useEffect, useState } from "react";
import { Settings, Activity, AlertTriangle, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GeneralSettings {
  businessName: string;
  currency: string;
  timezone: string;
  locale: string;
}

interface TaxSettings {
  defaultTaxRate: string;
  taxInclusive: boolean;
}

interface InventorySettings {
  lowStockThreshold: string;
  autoApproveAdjustments: boolean;
}

interface NotificationSettings {
  lowStockAlerts: boolean;
  expiryAlerts: boolean;
  creditLimitAlerts: boolean;
}

export default function GrocerySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const [general, setGeneral] = useState<GeneralSettings>({
    businessName: "",
    currency: "SAR",
    timezone: "Asia/Riyadh",
    locale: "ar-SA",
  });
  const [tax, setTax] = useState<TaxSettings>({
    defaultTaxRate: "15",
    taxInclusive: false,
  });
  const [inventory, setInventory] = useState<InventorySettings>({
    lowStockThreshold: "10",
    autoApproveAdjustments: false,
  });
  const [notifications, setNotifications] = useState<NotificationSettings>({
    lowStockAlerts: true,
    expiryAlerts: true,
    creditLimitAlerts: true,
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/settings");
        const json = await res.json();
        if (json.ok) {
          const data = json.data;
          if (data.general) setGeneral(data.general);
          if (data.tax) setTax(data.tax);
          if (data.inventory) setInventory(data.inventory);
          if (data.notifications) setNotifications(data.notifications);
        } else {
          setError("فشل تحميل الإعدادات");
        }
      } catch {
        setError("فشل تحميل الإعدادات");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function handleSave(tab: string) {
    setSaving(true);
    try {
      let payload: Record<string, unknown> = {};
      switch (tab) {
        case "general":
          payload = { general };
          break;
        case "tax":
          payload = {
            tax: {
              ...tax,
              defaultTaxRate: Number(tax.defaultTaxRate),
            },
          };
          break;
        case "inventory":
          payload = {
            inventory: {
              ...inventory,
              lowStockThreshold: Number(inventory.lowStockThreshold),
            },
          };
          break;
        case "notifications":
          payload = { notifications };
          break;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setError("فشل حفظ الإعدادات");
      }
    } catch {
      setError("فشل حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">
            إعدادات النظام العام للمتجر
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex h-48 items-center justify-center">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Activity className="h-5 w-5 animate-pulse text-primary" />
                <span className="text-sm">جاري التحميل...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">
          إعدادات النظام العام للمتجر
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-400">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto h-6 p-0"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">عام</TabsTrigger>
          <TabsTrigger value="tax">الضرائب</TabsTrigger>
          <TabsTrigger value="inventory">المخزون</TabsTrigger>
          <TabsTrigger value="notifications">الإشعارات</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإعدادات العامة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>اسم النشاط</Label>
                  <Input
                    value={general.businessName}
                    onChange={(e) =>
                      setGeneral((prev) => ({
                        ...prev,
                        businessName: e.target.value,
                      }))
                    }
                    placeholder="اسم المتجر"
                  />
                </div>
                <div className="space-y-2">
                  <Label>العملة</Label>
                  <Select
                    value={general.currency}
                    onValueChange={(v) =>
                      setGeneral((prev) => ({ ...prev, currency: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                      <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                      <SelectItem value="KWD">دينار كويتي (KWD)</SelectItem>
                      <SelectItem value="BHD">دينار بحريني (BHD)</SelectItem>
                      <SelectItem value="OMR">ريال عماني (OMR)</SelectItem>
                      <SelectItem value="QAR">ريال قطري (QAR)</SelectItem>
                      <SelectItem value="EGP">جنيه مصري (EGP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>المنطقة الزمنية</Label>
                  <Select
                    value={general.timezone}
                    onValueChange={(v) =>
                      setGeneral((prev) => ({ ...prev, timezone: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Riyadh">Asia/Riyadh</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                      <SelectItem value="Asia/Kuwait">Asia/Kuwait</SelectItem>
                      <SelectItem value="Asia/Bahrain">Asia/Bahrain</SelectItem>
                      <SelectItem value="Asia/Muscat">Asia/Muscat</SelectItem>
                      <SelectItem value="Asia/Qatar">Asia/Qatar</SelectItem>
                      <SelectItem value="Africa/Cairo">Africa/Cairo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>اللغة</Label>
                  <Select
                    value={general.locale}
                    onValueChange={(v) =>
                      setGeneral((prev) => ({ ...prev, locale: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar-SA">العربية (السعودية)</SelectItem>
                      <SelectItem value="ar-AE">العربية (الإمارات)</SelectItem>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="en-GB">English (UK)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="bg-primary hover:bg-primary/80 text-white"
                  onClick={() => handleSave("general")}
                  disabled={saving}
                >
                  <Save className="ml-2 h-4 w-4" />
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax */}
        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إعدادات الضرائب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>نسبة الضريبة الافتراضية (%)</Label>
                  <Input
                    type="number"
                    value={tax.defaultTaxRate}
                    onChange={(e) =>
                      setTax((prev) => ({
                        ...prev,
                        defaultTaxRate: e.target.value,
                      }))
                    }
                    min="0"
                    max="100"
                    dir="ltr"
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={tax.taxInclusive}
                      onCheckedChange={(checked) =>
                        setTax((prev) => ({ ...prev, taxInclusive: checked }))
                      }
                    />
                    <div>
                      <Label>الأسعار شاملة الضريبة</Label>
                      <p className="text-xs text-muted-foreground">
                        عند التفعيل، تُضاف الضريبة داخل السعر المعروض
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="bg-primary hover:bg-primary/80 text-white"
                  onClick={() => handleSave("tax")}
                  disabled={saving}
                >
                  <Save className="ml-2 h-4 w-4" />
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory */}
        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إعدادات المخزون</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>حد التنبيه للمخزون المنخفض</Label>
                  <Input
                    type="number"
                    value={inventory.lowStockThreshold}
                    onChange={(e) =>
                      setInventory((prev) => ({
                        ...prev,
                        lowStockThreshold: e.target.value,
                      }))
                    }
                    min="0"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    سيتم تنبيهك عندما ينخفض مخزون أي منتج عن هذا الحد
                  </p>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={inventory.autoApproveAdjustments}
                      onCheckedChange={(checked) =>
                        setInventory((prev) => ({
                          ...prev,
                          autoApproveAdjustments: checked,
                        }))
                      }
                    />
                    <div>
                      <Label>الموافقة التلقائية على التعديلات</Label>
                      <p className="text-xs text-muted-foreground">
                        عند التفعيل، تُعتمد تعديلات المخزون تلقائياً
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="bg-primary hover:bg-primary/80 text-white"
                  onClick={() => handleSave("inventory")}
                  disabled={saving}
                >
                  <Save className="ml-2 h-4 w-4" />
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إعدادات الإشعارات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="text-sm font-medium">
                      تنبيه المخزون المنخفض
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      إشعار عند انخفاض مخزون أي منتج عن الحد المحدد
                    </p>
                  </div>
                  <Switch
                    checked={notifications.lowStockAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        lowStockAlerts: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="text-sm font-medium">
                      تنبيه انتهاء الصلاحية
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      إشعار قبل انتهاء صلاحية المنتجات القابلة للفساد
                    </p>
                  </div>
                  <Switch
                    checked={notifications.expiryAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        expiryAlerts: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="text-sm font-medium">
                      تنبيه حد الائتمان
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      إشعار عند تجاوز العميل أو المورد لحد الائتمان
                    </p>
                  </div>
                  <Switch
                    checked={notifications.creditLimitAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        creditLimitAlerts: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="bg-primary hover:bg-primary/80 text-white"
                  onClick={() => handleSave("notifications")}
                  disabled={saving}
                >
                  <Save className="ml-2 h-4 w-4" />
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
