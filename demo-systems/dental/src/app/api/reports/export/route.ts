import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasPermission } from "@/lib/dal"
import type { Permission } from "@/lib/permissions"

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n")
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { role } = session
  const roleRecord = await prisma.role.findUnique({
    where: { key: role },
    select: { permissions: true },
  })
  const permissions = (roleRecord?.permissions ?? []) as Permission[]
  if (!hasPermission({ permissions }, "reports:export")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const type = req.nextUrl.searchParams.get("type") ?? "procedures"
  const scope = session.branchId ? { branchId: session.branchId } : {}
  const whereAll = { patient: { deletedAt: null }, ...scope }

  let filename = "report.csv"
  let rows: (string | number | null | undefined)[][]

  const month = new Date()
  month.setDate(1)
  month.setHours(0, 0, 0, 0)

  switch (type) {
    case "procedures": {
      const data = await prisma.invoiceItem.groupBy({
        by: ["description"],
        where: { invoice: { ...whereAll, status: { not: "CANCELLED" } } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: "desc" } },
      })
      rows = [
        ["Procedure", "Count", "Amount"],
        ...data.map((d) => [d.description, d._sum.quantity ?? 0, Number(d._sum.total ?? 0)]),
      ]
      filename = "procedures.csv"
      break
    }
    case "patients": {
      const grouped = await prisma.payment.groupBy({
        by: ["patientId"],
        where: whereAll,
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 50,
      })
      const patients = await prisma.patient.findMany({
        where: { id: { in: grouped.map((g) => g.patientId) } },
        select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true },
      })
      const map = new Map(patients.map((p) => [p.id, p]))
      rows = [
        ["Patient", "Patient No", "Total Paid"],
        ...grouped.map((g) => {
          const p = map.get(g.patientId)
          return [
            p ? [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ") : g.patientId,
            p?.patientNo ?? "",
            Number(g._sum.amount ?? 0),
          ]
        }),
      ]
      filename = "top-patients.csv"
      break
    }
    case "invoices": {
      const data = await prisma.invoice.groupBy({
        by: ["status"],
        where: whereAll,
        _count: { _all: true },
        _sum: { total: true, paid: true },
      })
      rows = [
        ["Status", "Count", "Total", "Paid"],
        ...data.map((d) => [d.status, d._count._all, Number(d._sum.total ?? 0), Number(d._sum.paid ?? 0)]),
      ]
      filename = "invoices-by-status.csv"
      break
    }
    case "expenses": {
      const data = await prisma.expense.groupBy({
        by: ["category"],
        where: { expenseDate: { gte: month }, ...(session.branchId ? { branchId: session.branchId } : {}) },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
      })
      rows = [
        ["Category", "Amount"],
        ...data.map((d) => [d.category, Number(d._sum.amount ?? 0)]),
      ]
      filename = "expenses-by-category.csv"
      break
    }
    default:
      return NextResponse.json({ error: "bad_type" }, { status: 400 })
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}