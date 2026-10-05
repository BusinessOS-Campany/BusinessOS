import { z } from "zod";
import type {
  ApplicationAdapter,
  AppMetadata,
  AppCapabilities,
  AppNavItem,
  AppDashboardWidget,
  AppAITool,
  AppHealthStatus,
} from "../types";

export class SamaCenterAdapter implements ApplicationAdapter {
  getMetadata(): AppMetadata {
    return {
      slug: "sama-center",
      name: "SAMA Physical Therapy Center",
      nameAr: "مركز سما للعلاج الطبيعي",
      description: "Physical therapy clinic management with patients, appointments, sessions, and financial reporting",
      descriptionAr: "نظام إدارة عيادة العلاج الطبيعي مع إدارة المرضى والمواعيد والجلسات والتقارير المالية",
      icon: "heart-pulse",
      category: "healthcare",
      version: "1.0.0",
      routePrefix: "/app/sama-center",
      capabilities: this.getCapabilities(),
      permissions: this.getPermissions(),
      navigation: this.getNavigation(),
      dashboardWidgets: this.getDashboardWidgets(),
      aiTools: this.getAITools(),
      configurationSchema: this.getSettingsSchema(),
    };
  }

  getCapabilities(): AppCapabilities {
    return {
      offlineSupported: false,
      syncSupported: false,
      barcodeSupported: false,
      printingSupported: true,
      cameraSupported: false,
    };
  }

  getNavigation(): AppNavItem[] {
    return [
      {
        name: "Dashboard",
        nameAr: "لوحة التحكم",
        href: "/app/sama-center",
        icon: "LayoutDashboard",
      },
      {
        name: "Patients",
        nameAr: "المرضى",
        href: "/app/sama-center/patients",
        icon: "Users",
        permission: "sama.patients.view",
      },
      {
        name: "Sessions",
        nameAr: "الجلسات",
        href: "/app/sama-center/sessions",
        icon: "Activity",
        permission: "sama.sessions.view",
      },
      {
        name: "Appointments",
        nameAr: "المواعيد",
        href: "/app/sama-center/appointments",
        icon: "CalendarCheck",
        permission: "sama.appointments.view",
      },
      {
        name: "Calendar",
        nameAr: "التقويم",
        href: "/app/sama-center/calendar",
        icon: "Calendar",
        permission: "sama.calendar.view",
      },
      {
        name: "Services",
        nameAr: "الخدمات",
        href: "/app/sama-center/services",
        icon: "Stethoscope",
        permission: "sama.services.view",
      },
      {
        name: "Employees",
        nameAr: "الموظفين",
        href: "/app/sama-center/employees",
        icon: "UserCog",
        permission: "sama.employees.view",
      },
      {
        name: "Coverages",
        nameAr: "التغطيات",
        href: "/app/sama-center/coverages",
        icon: "ClipboardList",
        permission: "sama.coverages.view",
      },
      {
        name: "Advances",
        nameAr: "السلف",
        href: "/app/sama-center/advances",
        icon: "Wallet",
        permission: "sama.advances.view",
      },
      {
        name: "Expenses",
        nameAr: "المصروفات",
        href: "/app/sama-center/expenses",
        icon: "Receipt",
        permission: "sama.expenses.view",
      },
      {
        name: "Reports",
        nameAr: "التقارير",
        href: "/app/sama-center/reports",
        icon: "BarChart3",
        permission: "sama.reports.view",
      },
      {
        name: "Settings",
        nameAr: "الإعدادات",
        href: "/app/sama-center/settings",
        icon: "Settings",
        permission: "sama.settings.manage",
      },
    ];
  }

  getPermissions(): string[] {
    return [
      // Patients
      "sama.patients.view",
      "sama.patients.create",
      "sama.patients.edit",
      "sama.patients.delete",
      // Sessions
      "sama.sessions.view",
      "sama.sessions.create",
      "sama.sessions.edit",
      "sama.sessions.delete",
      // Appointments
      "sama.appointments.view",
      "sama.appointments.create",
      "sama.appointments.edit",
      "sama.appointments.delete",
      // Services
      "sama.services.view",
      "sama.services.create",
      "sama.services.edit",
      "sama.services.delete",
      // Employees
      "sama.employees.view",
      "sama.employees.create",
      "sama.employees.edit",
      "sama.employees.delete",
      // Coverages
      "sama.coverages.view",
      "sama.coverages.create",
      "sama.coverages.edit",
      "sama.coverages.delete",
      // Advances
      "sama.advances.view",
      "sama.advances.create",
      "sama.advances.edit",
      "sama.advances.delete",
      // Calendar
      "sama.calendar.view",
      "sama.calendar.create",
      "sama.calendar.edit",
      "sama.calendar.delete",
      // Reports
      "sama.reports.view",
      "sama.reports.financial",
      // Expenses
      "sama.expenses.view",
      "sama.expenses.create",
      // Admin
      "sama.users.manage",
      "sama.settings.manage",
    ];
  }

  getDashboardWidgets(): AppDashboardWidget[] {
    return [
      {
        id: "sama-patients-today",
        type: "kpi",
        title: "Patients Today",
        titleAr: "مرضى اليوم",
        permission: "sama.patients.view",
        config: {
          metric: "patientsToday",
          description: "Today's new patient registrations",
          descriptionAr: "تسجيلات المرضى الجدد اليوم",
        },
        defaultPosition: { x: 0, y: 0, w: 1, h: 1 },
      },
      {
        id: "sama-appointments-today",
        type: "kpi",
        title: "Appointments Today",
        titleAr: "مواعيد اليوم",
        permission: "sama.appointments.view",
        config: {
          metric: "appointmentsToday",
          description: "Today's scheduled appointments",
          descriptionAr: "المواعيد المجدولة اليوم",
        },
        defaultPosition: { x: 1, y: 0, w: 1, h: 1 },
      },
      {
        id: "sama-sessions-today",
        type: "kpi",
        title: "Sessions Today",
        titleAr: "جلسات اليوم",
        permission: "sama.sessions.view",
        config: {
          metric: "sessionsToday",
          description: "Today's completed sessions",
          descriptionAr: "الجلسات المكتملة اليوم",
        },
        defaultPosition: { x: 2, y: 0, w: 1, h: 1 },
      },
      {
        id: "sama-income-today",
        type: "kpi",
        title: "Today's Income",
        titleAr: "دخل اليوم",
        permission: "sama.reports.view",
        config: {
          metric: "incomeToday",
          format: "currency",
          currency: "YER",
          description: "Total income from today's sessions",
          descriptionAr: "إجمالي دخل جلسات اليوم",
        },
        defaultPosition: { x: 3, y: 0, w: 1, h: 1 },
      },
    ];
  }

  getAITools(): AppAITool[] {
    return [
      {
        name: "getSamaPatientStats",
        description: "Get patient statistics including count by status, gender, and exam type",
        descriptionAr: "إحصائيات المرضى حسب الحالة والجنس ونوع الفحص",
        permission: "sama.reports.view",
        parametersSchema: z.object({
          period: z.enum(["today", "week", "month", "year"]).default("today"),
          groupBy: z.enum(["status", "gender", "examType", "all"]).default("all"),
        }),
        isMutating: false,
      },
      {
        name: "getSamaDailyIncome",
        description: "Get income summary for today, this week, or this month",
        descriptionAr: "ملخص الدخل لليوم أو الأسبوع أو الشهر",
        permission: "sama.reports.financial",
        parametersSchema: z.object({
          period: z.enum(["today", "week", "month"]).default("today"),
          breakdown: z.enum(["byService", "byEmployee", "total"]).default("total"),
        }),
        isMutating: false,
      },
    ];
  }

  getSettingsSchema(): z.ZodType | null {
    return z.object({
      currency: z.string().default("YER"),
      timezone: z.string().default("Asia/Aden"),
      appointmentDuration: z.number().min(5).max(120).default(30),
    });
  }

  async getHealthStatus(): Promise<AppHealthStatus> {
    return {
      status: "healthy",
      message: "SAMA Center service is operational",
      lastChecked: new Date(),
    };
  }
}
