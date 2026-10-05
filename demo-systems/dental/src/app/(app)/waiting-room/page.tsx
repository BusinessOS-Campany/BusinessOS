import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { UserPlus } from "lucide-react"
import { LANG_COOKIE, dictionary, localeFrom, type Locale } from "@/lib/i18n"
import { WaitingBoard, type WaitingEntryRow } from "@/components/waiting-room/waiting-board"
import { CheckInDialog, type WaitingRoomOptions } from "@/components/waiting-room/check-in-dialog"
import { Button } from "@/components/ui/button"

export default async function WaitingRoomPage() {
  const user = await requirePermission("waitingRoom:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const t = dictionary[locale]
  const branchId = user.branchId ?? (await prisma.branch.findFirstOrThrow({ select: { id: true } })).id

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [
    activeEntries,
    completedEntries,
    patients,
    dentists,
    chairs,
    appointments,
  ] = await Promise.all([
    prisma.waitingEntry.findMany({
      where: { branchId, status: { not: "COMPLETED" } },
      orderBy: { arrivedAt: "asc" },
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true, phone: true } },
        dentist: { select: { user: { select: { name: true, nameAr: true } } } },
        chair: { select: { name: true } },
      },
    }),
    prisma.waitingEntry.findMany({
      where: { branchId, status: "COMPLETED", arrivedAt: { gte: startOfToday } },
      orderBy: { arrivedAt: "desc" },
      take: 30,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true, phone: true } },
        dentist: { select: { user: { select: { name: true, nameAr: true } } } },
        chair: { select: { name: true } },
      },
    }),
    prisma.patient.findMany({
      where: { deletedAt: null, ...(user.branchId ? { branchId: user.branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true },
    }),
    prisma.dentist.findMany({
      where: { isActive: true },
      select: { id: true, user: { select: { name: true, nameAr: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.chair.findMany({
      where: { branchId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        branchId,
        date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      orderBy: { startTime: "asc" },
      take: 40,
      include: {
        patient: { select: { patientNo: true, firstName: true, middleName: true, lastName: true } },
      },
    }),
  ])

  const toRow = (e: (typeof activeEntries)[number]): WaitingEntryRow => ({
    id: e.id,
    patientId: e.patient.id,
    patientName: [e.patient.firstName, e.patient.middleName, e.patient.lastName].filter(Boolean).join(" "),
    patientNo: e.patient.patientNo,
    patientPhone: e.patient.phone,
    arrivedAt: e.arrivedAt.toISOString(),
    dentistName: e.dentist?.user
      ? locale === "ar"
        ? (e.dentist.user.nameAr ?? e.dentist.user.name)
        : e.dentist.user.name
      : null,
    chairName: e.chair?.name ?? null,
    priority: e.priority ? (e.priority as string) : null,
    notes: e.notes,
    status: e.status,
    appointmentId: e.appointmentId,
  })

  const options: WaitingRoomOptions = {
    patients: patients.map((p) => ({
      id: p.id,
      label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
    })),
    dentists: dentists.map((d) => ({
      id: d.id,
      label: d.user.nameAr ? `${d.user.name} · ${d.user.nameAr}` : d.user.name,
    })),
    chairs: chairs.map((c) => ({ id: c.id, label: c.name })),
    appointments: appointments.map((a) => ({
      id: a.id,
      label: `${a.startTime} — ${[a.patient.firstName, a.patient.middleName, a.patient.lastName].filter(Boolean).join(" ")}`,
    })),
  }

  const canCreate = user.permissions.includes("waitingRoom:create")
  const canEdit = user.permissions.includes("waitingRoom:edit")

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.waitingRoom.title}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar" ? `${activeEntries.length} في الانتظار حالياً` : `${activeEntries.length} currently waiting`}
          </p>
        </div>
        {canCreate && (
          <CheckInDialog
            options={options}
            trigger={
              <Button>
                <UserPlus className="h-4 w-4" />
                {t.waitingRoom.checkIn}
              </Button>
            }
          />
        )}
      </div>

      <WaitingBoard
        active={activeEntries.map(toRow)}
        completed={completedEntries.map(toRow)}
        canEdit={canEdit}
      />
    </div>
  )
}