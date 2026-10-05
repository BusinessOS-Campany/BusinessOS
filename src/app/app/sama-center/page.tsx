"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LazySessionTypesChart } from "@/components/charts/lazy-charts";
import {
  HeartPulse,
  CalendarDays,
  Users,
  DollarSign,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Stethoscope,
  CalendarClock,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DashboardData {
  orgName: string;
  kpis: {
    todaySessions: number;
    appointments: number;
    newPatients: number;
    income: number;
  };
  sessionTypes: Array<{ type: string; count: number }>;
  upcomingAppointments: Array<{
    id: string;
    patientName: string;
    therapist: string;
    date: string;
    time: string;
    status: string;
  }>;
  recentPatients: Array<{
    id: string;
    name: string;
    phone: string;
    examType: string;
    status: string;
    createdAt: string;
  }>;
}

function formatMoney(amount: number): string {
  const riyals = amount / 100;
  return (
    riyals.toLocaleString("ar-SA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " ي.ع"
  );
}

function arabicDate(): string {
  return new Date().toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  trendLabel,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn("rounded-lg p-2", iconColor)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{value}</div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend === "up" && (
            <ArrowUpRight className="h-3 w-3 text-primary" />
          )}
          {trend === "down" && (
            <ArrowUpRight className="h-3 w-3 rotate-90 text-red-400" />
          )}
          {trendLabel && (
            <span
              className={cn(
                trend === "up" && "text-primary",
                trend === "down" && "text-red-400",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trendLabel}
            </span>
          )}
          {subtitle && !trendLabel && (
            <span className="text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const sessionTypeLabels: Record<string, string> = {
  normal: "جلسة عادية",
  hijama: "حجامة",
};

export default function SamaCenterDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/v1/sama-center/dashboard");
        const json = await res.json();
        if (json.ok) {
          setData(json.data);
        } else {
          setError("فشل تحميل البيانات");
        }
      } catch {
        setError("فشل تحميل البيانات");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Activity className="h-5 w-5 animate-pulse text-primary" />
          <span className="text-sm">جاري تحميل لوحة التحكم...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Card className="max-w-sm text-center">
          <CardContent className="pt-6">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
            <p className="mt-4 text-sm text-card-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kpis = data?.kpis ?? {
    todaySessions: 0,
    appointments: 0,
    newPatients: 0,
    income: 0,
  };
  const sessionTypes = data?.sessionTypes ?? [];
  const upcomingAppointments = data?.upcomingAppointments ?? [];
  const recentPatients = data?.recentPatients ?? [];

  const statusLabels: Record<string, { label: string; variant: "success" | "secondary" | "destructive" | "warning" }> = {
    pending: { label: "معلق", variant: "warning" },
    confirmed: { label: "مؤكد", variant: "success" },
    completed: { label: "مكتمل", variant: "success" },
    cancelled: { label: "ملغي", variant: "destructive" },
  };

  const patientStatusLabels: Record<string, { label: string; variant: "success" | "secondary" | "destructive" | "warning" }> = {
    progress: { label: "قيد العلاج", variant: "warning" },
    completed: { label: "مكتمل", variant: "success" },
    cancelled: { label: "ملغي", variant: "destructive" },
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* Welcome Banner */}
      <Card className="border-primary/20 bg-gradient-to-l from-primary/10 to-background dark:from-primary/10 dark:to-background">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                مرحباً بكم في مركز سما
              </h1>
              {data?.orgName && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.orgName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>{arabicDate()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="جلسات اليوم"
          value={String(kpis.todaySessions)}
          icon={Stethoscope}
          iconColor="bg-primary"
          trend="up"
          trendLabel="اليوم"
        />
        <KpiCard
          title="المواعيد"
          value={String(kpis.appointments)}
          icon={CalendarClock}
          iconColor="bg-primary/80"
        />
        <KpiCard
          title="مرضى جدد"
          value={String(kpis.newPatients)}
          icon={Users}
          iconColor="bg-success"
          trend="up"
        />
        <KpiCard
          title="الدخل"
          value={formatMoney(kpis.income)}
          icon={DollarSign}
          iconColor="bg-primary/60"
          trend={kpis.income > 0 ? "up" : "neutral"}
        />
      </div>

      {/* Charts + Tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Session Types Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              أنواع الجلسات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {sessionTypes.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">لا توجد بيانات بعد</p>
                </div>
              ) : (
                <LazySessionTypesChart data={sessionTypes} labels={sessionTypeLabels} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              المواعيد القادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                لا توجد مواعيد قادمة
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.slice(0, 6).map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-card-foreground">
                        {appt.patientName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {appt.therapist} — {appt.time}
                      </p>
                    </div>
                    <Badge
                      variant={statusLabels[appt.status]?.variant ?? "secondary"}
                      className="text-[10px]"
                    >
                      {statusLabels[appt.status]?.label ?? appt.status}
                    </Badge>
                  </div>
                ))}
                {upcomingAppointments.length > 6 && (
                  <Link
                    href="/app/sama-center/appointments"
                    className="flex items-center justify-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    عرض الكل
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Patients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
            <Users className="h-4 w-4 text-primary" />
            آخر المرضى المسجلين
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              لا يوجد مرضى بعد
            </p>
          ) : (
            <div className="space-y-2">
              {recentPatients.slice(0, 6).map((patient) => (
                <Link
                  key={patient.id}
                  href={`/app/sama-center/patients?id=${patient.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {patient.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {patient.examType} —{" "}
                      {new Date(patient.createdAt).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                  <Badge
                    variant={patientStatusLabels[patient.status]?.variant ?? "secondary"}
                    className="text-[10px]"
                  >
                    {patientStatusLabels[patient.status]?.label ?? patient.status}
                  </Badge>
                </Link>
              ))}
              {recentPatients.length > 6 && (
                <Link
                  href="/app/sama-center/patients"
                    className="flex items-center justify-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  عرض الكل
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
