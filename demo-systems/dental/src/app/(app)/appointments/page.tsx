import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { CalendarPlus } from "lucide-react"
import { AppointmentTable } from "@/components/appointments/appointment-table"
import { AppointmentFormDialog } from "@/components/appointments/appointment-form-dialog"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { APPOINTMENT_STATUSES } from "@/lib/constants/clinical"
import { cn } from "@/lib/utils"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

const PER_PAGE = 20

function localDateInput(): string {
  const d = new Date()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mo}-${day}`
}

export default async function AppointmentsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("appointments:view")
  const url: Params = (await searchParams) ?? {}

  const dateParam = typeof url.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(url.date) ? url.date : localDateInput()
  const status = typeof url.status === "string" ? url.status : ""
  const page = Math.max(1, Number(typeof url.page === "string" ? url.page : 1) || 1)
  const perPage = PER_PAGE

  const dateObj = new Date(`${dateParam}T00:00:00Z`)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    date: dateObj,
    ...(status ? { status: status as never } : {}),
  }

  const [total, rows, dentists, chairs, patientOptions] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      orderBy: { startTime: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        patient: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        dentist: { select: { user: { select: { name: true, nameAr: true } } } },
        chair: { select: { id: true, name: true, nameAr: true } },
      },
    }),
    prisma.dentist.findMany({
      where: { isActive: true },
      select: { id: true, user: { select: { name: true, nameAr: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.chair.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.patient.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true, patientNo: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  ])

  const tableRows = rows.map((a) => ({
    id: a.id,
    patientId: a.patient.id,
    patientName: `${a.patient.firstName} ${a.patient.lastName}`,
    date: a.date.toISOString().slice(0, 10).split("-").reverse().join("/"),
    startTime: a.startTime,
    endTime: a.endTime,
    dentistName: a.dentist?.user.name ?? null,
    type: a.type,
    chairName: a.chair?.name ?? null,
    status: a.status,
  }))

  const formOptions = {
    patients: patientOptions.map((p) => ({
      id: p.id,
      label: `${p.patientNo} — ${p.firstName} ${p.lastName}`,
    })),
    dentists: dentists.map((d) => ({
      id: d.id,
      label: d.user.name,
    })),
    chairs: chairs.map((c) => ({ id: c.id, label: c.name })),
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const makeHref = (p: number) => {
    const qs = new URLSearchParams()
    qs.set("date", dateParam)
    if (status) qs.set("status", status)
    if (p > 1) qs.set("page", String(p))
    return `/appointments?${qs.toString()}`
  }

  const link = (href: string, label: string, disabled?: boolean) =>
    disabled ? (
      <span
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "pointer-events-none opacity-50"
        )}
      >
        {label}
      </span>
    ) : (
      <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {label}
      </Link>
    )

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">{total} on {dateParam}</p>
        </div>
        {user.permissions.includes("appointments:create") && (
          <AppointmentFormDialog
            defaultDate={dateParam}
            options={formOptions}
            trigger={
              <span className={cn(buttonVariants(), "inline-flex cursor-pointer")}>
                <CalendarPlus className="h-4 w-4" />
                New Appointment
              </span>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/appointments" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <Input type="date" name="date" defaultValue={dateParam} className="sm:w-44" />
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-44"
          >
            <option value="">All statuses</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.en}</option>
            ))}
          </select>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Filter
          </button>
        </form>

        <AppointmentTable rows={tableRows} />

        <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            {total === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            {link(makeHref(page - 1), "Previous", page <= 1)}
            <span className="px-2 text-sm tabular-nums">Page {page} / {totalPages}</span>
            {link(makeHref(page + 1), "Next", page >= totalPages)}
          </div>
        </div>
      </Card>
    </div>
  )
}