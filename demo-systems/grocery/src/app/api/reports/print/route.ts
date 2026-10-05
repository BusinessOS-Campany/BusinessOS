import { readFile } from "node:fs/promises";
import path from "node:path";
import ejs from "ejs";
import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import { getT } from "@/shared/i18n";
import { parseReportRange } from "@/features/reports/schema";
import { salesReport } from "@/features/reports/service";
import { getStoreSettings } from "@/features/settings/service";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/shared/core/format";

const money = (v: number | string | null | undefined) => formatMoney(v);
const num = (v: number | string | null | undefined) => formatNumber(v);

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports.view");
    const sp = request.nextUrl.searchParams;
    const range = parseReportRange({ from: sp.get("from"), to: sp.get("to") });

    const [{ summary, buckets, byCashier, products }, store, { t }] = await Promise.all([
      salesReport(range),
      getStoreSettings(),
      getT(),
    ]);

    const dayTotals = buckets.reduce(
      (acc, b) => ({ revenue: acc.revenue + b.revenue, cost: acc.cost + b.cost, profit: acc.profit + b.profit }),
      { revenue: 0, cost: 0, profit: 0 },
    );

    const templatePath = path.join(process.cwd(), "src/features/reports/ejs/sales-summary.ejs");
    const template = await readFile(templatePath, "utf8");

    const html = ejs.render(template, {
      title: t.reports.salesReport,
      storeName: store?.name ?? "",
      storeNameAr: store?.nameAr ?? store?.name ?? "",
      storeLetter: (store?.name ?? store?.nameAr ?? "S").trim().charAt(0) || "S",
      fromLabel: formatDate(range.fromISO),
      toLabel: formatDate(range.toISO),
      generatedAt: formatDateTime(new Date()),
      summary,
      buckets,
      dayTotals,
      byCashier,
      products,
      money,
      num,
      autoprint: true,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 },
    );
  }
}