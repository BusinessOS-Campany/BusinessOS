"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { updateAppointmentStatusAction } from "@/lib/actions/appointments"
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from "@/lib/constants/clinical"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { statusColor } from "@/lib/status-ui"

export interface AppointmentRow {
  id: string
  patientId: string
  patientName: string
  date: string
  startTime: string
  endTime: string
  dentistName: string | null
  type: string
  chairName: string | null
  status: string
}

interface Props {
  rows: AppointmentRow[]
}

export function AppointmentTable({ rows }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const typeLabel = (v: string) => {
    const found = APPOINTMENT_TYPES.find((x) => x.value === v)
    if (!found) return v.replace(/_/g, " ")
    return locale === "ar" ? found.ar : found.en
  }

  const statusLabel = (v: string) => {
    const found = APPOINTMENT_STATUSES.find((x) => x.value === v)
    if (!found) return v.replace(/_/g, " ")
    return locale === "ar" ? found.ar : found.en
  }

  const changeStatus = (id: string, status: string) => {
    startTransition(async () => {
      const res = await updateAppointmentStatusAction(id, status)
      if (res.ok) router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t.common.noData}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.patients.fullName}</TableHead>
            <TableHead>{t.appointments.date}</TableHead>
            <TableHead>{t.appointments.startTime}</TableHead>
            <TableHead>{t.appointments.dentist}</TableHead>
            <TableHead>{t.appointments.type}</TableHead>
            <TableHead>{t.appointments.chair}</TableHead>
            <TableHead>{t.common.status}</TableHead>
            <TableHead className="text-end">{t.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link href={`/patients/${a.patientId}`} className="font-medium hover:underline">
                  {a.patientName}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{a.date}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{a.startTime}</TableCell>
              <TableCell>{a.dentistName ?? "—"}</TableCell>
              <TableCell>{typeLabel(a.type)}</TableCell>
              <TableCell>{a.chairName ?? "—"}</TableCell>
              <TableCell>
                <Badge style={{ borderColor: statusColor(a.status).border, color: statusColor(a.status).text }}>
                  {statusLabel(a.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={isPending}>
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t.common.actions}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>{t.common.status}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {APPOINTMENT_STATUSES.map((s) => (
                      <DropdownMenuItem
                        key={s.value}
                        disabled={s.value === a.status}
                        onClick={() => changeStatus(a.id, s.value)}
                      >
                        {statusLabel(s.value)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}