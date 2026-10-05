"use client";

import { useEffect, useState } from "react";
import { Settings, Activity, AlertTriangle, Save, X, Clock, Bell } from "lucide-react";
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
}

interface ClinicSettings {
  defaultAppointmentDuration: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: string[];
}

interface NotificationSettings {
  appointmentReminders: boolean;
  lowStockAlerts: boolean;
  dailyReportAlerts: boolean;
}

const ALL_DAYS = [
  { value: "sunday", label: "الأحد" },
  { value: "monday", label: "الإثنين" },
  { value: "tuesday", label: "الثلاثاء" },
  { value: "wednesday", label: "الأربعاء" },
  { value: "thursday", label: "الخميس" },
  { value: "friday", label: "الجمعة" },
  { value: "saturday", label: "السبت" },
];

export default function SamaCenterSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const [general, setGeneral] = useState<GeneralSettings>({
    businessName: "",
    currency: "YER",
    timezone: "Asia/Riyadh",
  });
  const [clinic, setClinic] = useState<ClinicSettings>({
    defaultAppointmentDuration: "30",
    workingHoursStart: "09:00",
    workingHoursEnd: "21:00",
    workingDays: ["sunday", "monday", "tuesday", "wednesday", "thursday", "saturday"],
  });
  const [notifications, setNotifications] = useState<NotificationSettings>({
    appointmentReminders: true,
    lowStockAlerts: true,
    dailyReportAlerts: false,
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/sama-center/settings");
        const json = await res.json();
        if (json.ok) {
          const data = json.data;
          if (data.general) setGeneral(data.general);
          if (data.clinic) setClinic(data.clinic);
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
        case "clinic":
          payload = {
            clinic: {
              ...clinic,
              defaultAppointmentDuration: Number(clinic.defaultAppointmentDuration),
            },
          };
          break;
        case "notifications":
          payload = { notifications };
          break;
      }

      const res = await fetch("/api/v1/sama-center/settings", {
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

  function toggleWorkingDay(day: string) {
    setClinic((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  }

  if (loading) {
    return (
      <div dir="rtl" className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">
            إعدادات مركز سما
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
          إعدادات مركز سما
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
          <TabsTrigger value="clinic">العيادة</TabsTrigger>
          <TabsTrigger value="notifications">الإشعارات</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                الإعدادات العامة
              </CardTitle>
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
                    placeholder="مركز سما للعلاج الطبيعي"
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
                      <SelectItem value="YER">ريال يمني (YER)</SelectItem>
                      <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                      <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                      <SelectItem value="KWD">دينار كويتي (KWD)</SelectItem>
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
                      <SelectItem value="Asia/Aden">Asia/Aden</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                      <SelectItem value="Asia/Kuwait">Asia/Kuwait</SelectItem>
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

        {/* Clinic */}
        <TabsContent value="clinic">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                إعدادات العيادة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>مدة الموعد الافتراضية (دقيقة)</Label>
                  <Input
                    type="number"
                    value={clinic.defaultAppointmentDuration}
                    onChange={(e) =>
                      setClinic((prev) => ({
                        ...prev,
                        defaultAppointmentDuration: e.target.value,
                      }))
                    }
                    min="5"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>بداية الدوام</Label>
                  <Input
                    type="time"
                    value={clinic.workingHoursStart}
                    onChange={(e) =>
                      setClinic((prev) => ({
                        ...prev,
                        workingHoursStart: e.target.value,
                      }))
                    }
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>نهاية الدوام</Label>
                  <Input
                    type="time"
                    value={clinic.workingHoursEnd}
                    onChange={(e) =>
                      setClinic((prev) => ({
                        ...prev,
                        workingHoursEnd: e.target.value,
                      }))
                    }
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>أيام العمل</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map((day) => {
                    const active = clinic.workingDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        onClick={() => toggleWorkingDay(day.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="bg-primary hover:bg-primary/80 text-white"
                  onClick={() => handleSave("clinic")}
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
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                إعدادات الإشعارات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="text-sm font-medium">
                      تذكير المواعيد
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      إرسال تذكير للمرضى قبل مواعيدهم
                    </p>
                  </div>
                  <Switch
                    checked={notifications.appointmentReminders}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        appointmentReminders: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label className="text-sm font-medium">
                      تنبيه المخزون المنخفض
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      إشعار عند نقص المستلزمات الطبية
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
                      تقرير يومي
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      إشعار بتقرير العيادة اليومي
                    </p>
                  </div>
                  <Switch
                    checked={notifications.dailyReportAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        dailyReportAlerts: checked,
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
