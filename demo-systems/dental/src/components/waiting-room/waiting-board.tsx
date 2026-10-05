"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { updateWaitingStatusAction } from "@/lib/actions/waiting-room"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { statusColor } from "@/lib/status-ui"

export interface WaitingEntryRow {
  id: string
  patientId: string
  patientName: string
  patientNo: string
  patientPhone: string | null
  arrivedAt: string
  dentistName: string | null
  chairName: string | null
  priority: string | null
  notes: string | null
  status: string
  appointmentId: string | null
}

interface Props {
  active: WaitingEntryRow[]
  completed: WaitingEntryRow[]
  canEdit: boolean
}

const FLOW: Record<string, string> = {
  WAITING: "CALLED",
  CALLED: "IN_ROOM",
  IN_ROOM: "WITH_DENTIST",
  WITH_DENTIST: "COMPLETED",
}

function timeOf(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function priorityColor(p: string): { border: string; text: string } {
  const map: Record<string, string> = { MILD: "158 84% 39%", MODERATE: "38 92% 50%", SEVERE: "0 72% 51%", CRITICAL: "0 90% 45%" }
  const c = map[p] ?? "215 16% 47%"
  return { border: `hsl(${c} / 0.4)`, text: `hsl(${c})` }
}

export function WaitingBoard({ active, completed, canEdit }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const statusLabel = (s: string) => {
    const key = s === "IN_ROOM" ? "inRoom" : s === "WITH_DENTIST" ? "withDentist" : s.toLowerCase()
    return t.statuses[key as keyof typeof t.statuses] ?? s.replace(/_/g, " ")
  }

  const columns = ["WAITING", "CALLED", "IN_ROOM", "WITH_DENTIST"]

  const advance = (row: WaitingEntryRow) => {
    const next = FLOW[row.status]
    startTransition(async () => {
      const res = await updateWaitingStatusAction(row.id, next)
      if (res.ok) router.refresh()
    })
  }

  function Card({ row }: { row: WaitingEntryRow }) {
    return (
      <div className="rounded-lg border bg-background p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/patients/${row.patientId}`} className="block truncate text-sm font-semibold hover:underline">
              {row.patientName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {row.patientNo}
              {row.patientPhone ? ` · ${row.patientPhone}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-xs tabular-nums text-muted-foreground">{timeOf(row.arrivedAt)}</span>
            {row.priority && row.priority !== "MILD" && (
              <Badge
                style={{
                  borderColor: priorityColor(row.priority).border,
                  color: priorityColor(row.priority).text,
                  backgroundColor: "transparent",
                }}
              >
                {row.priority}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {row.dentistName && (
            <span>
              {locale === "ar" ? "الطبيب:" : "Dr:"} {row.dentistName}
            </span>
          )}
          {row.chairName && (
            <span>
              {locale === "ar" ? "الكرسي:" : "Chair:"} {row.chairName}
            </span>
          )}
          {row.appointmentId && (
            <span>
              {locale === "ar" ? "موعد" : "Appointment"}
            </span>
          )}
        </div>

        {row.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{row.notes}</p>}

        {canEdit && row.status !== "COMPLETED" && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" disabled={isPending} onClick={() => advance(row)}>
              {row.status === "WITH_DENTIST"
                ? locale === "ar"
                  ? "إنهاء"
                  : t.waitingRoom.complete
                : t.waitingRoom.advance}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <div key={col} className="rounded-xl border bg-muted/30">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">{statusLabel(col)}</span>
              <Badge style={{ borderColor: statusColor(col).border, color: statusColor(col).text }}>
                {active.filter((r) => r.status === col).length}
              </Badge>
            </div>
            <div className="grid gap-2 p-2">
              {active
                .filter((r) => r.status === col)
                .map((r) => (
                  <Card key={r.id} row={r} />
                ))}
              {active.filter((r) => r.status === col).length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">{t.waitingRoom.noActive}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-muted/30">
        <div className="border-b px-3 py-2">
          <span className="text-sm font-semibold">{t.waitingRoom.completedToday}</span>
        </div>
        <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3">
          {completed.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              {t.waitingRoom.noCompleted}
            </p>
          ) : (
            completed.map((r) => <Card key={r.id} row={r} />)
          )}
        </div>
      </div>
    </div>
  )
}