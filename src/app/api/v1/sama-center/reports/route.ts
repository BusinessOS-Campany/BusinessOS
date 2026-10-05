import { ok, withRoute, ApiError } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import {
  getDailySummary,
  getMonthlySummary,
  getWeeklySummary,
} from "@/core/sama/dashboard";

type ReportType = "daily" | "weekly" | "monthly";

const TITLES: Record<ReportType, string> = {
  daily: "التقرير اليومي",
  weekly: "التقرير الأسبوعي",
  monthly: "التقرير الشهري",
};

export const GET = withRoute("v1.sama-center.reports.get", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { reports: ["read"] });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as ReportType | null;
  const dateStr = url.searchParams.get("date");

  if (!type || !["daily", "weekly", "monthly"].includes(type)) {
    throw ApiError.badRequest("type query param is required (daily|weekly|monthly)");
  }
  if (!dateStr || Number.isNaN(Date.parse(dateStr))) {
    throw ApiError.badRequest("date query param is required (YYYY-MM-DD)");
  }

  const date = new Date(`${dateStr}T00:00:00.000Z`);

  let income = 0n;
  let expenses = 0n;
  let net = 0n;
  let sessionsCount = 0;
  let advancesCount = 0;

  if (type === "daily") {
    const s = await getDailySummary(tenant.organizationId, date);
    income = s.income; expenses = s.expenses; net = s.net;
    sessionsCount = s.sessionsCount; advancesCount = s.advancesCount;
  } else if (type === "weekly") {
    const s = await getWeeklySummary(tenant.organizationId, date);
    income = s.income; expenses = s.expenses; net = s.net;
    sessionsCount = s.sessionsCount; advancesCount = s.advancesCount;
  } else {
    const s = await getMonthlySummary(tenant.organizationId, date.getUTCMonth(), date.getUTCFullYear());
    income = s.income; expenses = s.expenses; net = s.net;
    sessionsCount = s.sessionsCount; advancesCount = s.advancesCount;
  }

  const rows = [
    { label: "إيرادات الجلسات", value: Number(income), count: sessionsCount },
    { label: "المصروفات والسلف", value: Number(expenses), count: advancesCount },
  ];

  return ok({
    type,
    title: TITLES[type],
    total: Number(net),
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  });
});