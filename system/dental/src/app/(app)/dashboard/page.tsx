import { CalendarDays, Users, Wallet, Bell, ArrowRight } from "lucide-react"
import Link from "next/link"
import { requireAuth } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { StatusChart } from "@/components/dashboard/status-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatTime } from "@/lib/format"

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "hsl(var(--primary))",
  CONFIRMED: "hsl(var(--accent))",
  CHECKED_IN: "hsl(25 100% 60%)",
  IN_TREATMENT: "hsl(var(--destructive))",
  COMPLETED: "hsl(160 84% 39%)",
  CANCELLED: "hsl(var(--muted-foreground))",
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export default async function DashboardPage() {
  const user = await requireAuth()
  const branchId = user.branchId ?? undefined

  const today = startOfToday()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [patientCount, todayAppointments, revenueThisMonth, overdueInvoices] = await Promise.all([
    prisma.patient.count({ where: { deletedAt: null, ...(branchId ? { branchId } : {}) } }),
    prisma.appointment.count({
      where: { date: today, status: { in: ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_TREATMENT"] } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: monthStart } },
    }),
    prisma.invoice.aggregate({
      _sum: { remaining: true },
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
    }),
  ])

  const monthly: { month: string; revenue: number }[] = await prisma.$queryRaw`
    SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') as month, COALESCE(SUM(amount), 0) as revenue
    FROM "Payment"
    WHERE "paidAt" >= date_trunc('month', NOW() - INTERVAL '5 months')
    GROUP BY 1
    ORDER BY 1
  `

  const todayStats = await prisma.appointment.groupBy({
    by: ["status"],
    where: { date: today },
    _count: { _all: true },
  })

  const recentAppointments = await prisma.appointment.findMany({
    where: { date: today },
    orderBy: { startTime: "asc" },
    take: 6,
    include: {
      patient: { select: { firstName: true, lastName: true, gender: true } },
      dentist: { select: { user: { select: { name: true, nameAr: true } } } },
    },
  })

  const monthLabel = monthly
    .map((m) => {
      const [y, mo] = m.month.split("-")
      return { ...m, month: `${mo}/${y.slice(2)}`, revenue: Number(m.revenue) }
    })
    .sort((a, b) => a.month.localeCompare(b.month))

  const statusData = todayStats.map((s) => ({
    name: s.status,
    value: s._count._all,
    color: STATUS_COLORS[s.status] ?? "hsl(var(--muted))",
  }))

  const outstanding = Number(overdueInvoices._sum.remaining ?? 0)

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {user.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
<KpiCard
          title="Total Patients"
          value={patientCount.toLocaleString()}
          description="Active patients"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          title={"Today's Appointments"}
          value={todayAppointments}
          description={`${todayStats.reduce((s, e) => s + e._count._all, 0)} total today`}
          icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          title="Revenue This Month"
          value={formatCurrency(Number(revenueThisMonth._sum.amount ?? 0))}
          description="Collected payments"
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          title="Outstanding Balance"
          value={formatCurrency(outstanding)}
          description="Unpaid invoices"
          icon={<Bell className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={monthLabel} title="Monthly Revenue" />
        </div>
        <StatusChart data={statusData} title={"Today's Appointment Status"} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{"Today's Appointments"}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/appointments">
                View all
                <ArrowRight className="ms-1 h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentAppointments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No appointments scheduled for today.
              </p>
            ) : (
              <div className="divide-y">
                {recentAppointments.map((a) => (
                  <div key={a.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-[64px] text-sm font-semibold tabular-nums">
                      {formatTime(a.startTime)} - {formatTime(a.endTime)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {a.patient.firstName} {a.patient.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.dentist?.user?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <Badge variant="outline">{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}