"use client"

import Link from "next/link"
import { Eye } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { calcAge } from "@/lib/format"

export interface PatientRow {
  id: string
  patientNo: string
  firstName: string
  middleName: string | null
  lastName: string
  gender: "MALE" | "FEMALE"
  phone: string | null
  city: string | null
  isActive: boolean
  dateOfBirth: string | null
  createdAt: string
}

interface PatientsTableProps {
  rows: PatientRow[]
}

export function PatientsTable({ rows }: PatientsTableProps) {
  const { t, locale } = useI18n()

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t.common.noData}</p>
        <p className="text-xs text-muted-foreground/70">
          {locale === "ar" ? "جرّب تعديل البحث أو التصفية" : "Try adjusting your search or filters"}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.patients.patientNo}</TableHead>
            <TableHead>{t.patients.fullName}</TableHead>
            <TableHead>{t.patients.gender}</TableHead>
            <TableHead>{t.patients.age}</TableHead>
            <TableHead>{t.patients.phone}</TableHead>
            <TableHead>{t.patients.city}</TableHead>
            <TableHead className="text-end">{t.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const age = p.dateOfBirth ? calcAge(p.dateOfBirth) : null
            return (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.patientNo}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {p.firstName} {p.middleName ? `${p.middleName} ` : ""}{p.lastName}
                    </span>
                    {!p.isActive && <Badge variant="secondary">{t.patients.inactive}</Badge>}
                  </div>
                </TableCell>
                <TableCell>{locale === "ar" ? (p.gender === "MALE" ? "ذكر" : "أنثى") : p.gender === "MALE" ? "Male" : "Female"}</TableCell>
                <TableCell>{age !== null ? age : "—"}</TableCell>
                <TableCell dir="ltr" className="text-left">{p.phone ?? "—"}</TableCell>
                <TableCell>{p.city ?? "—"}</TableCell>
                <TableCell className="text-end">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/patients/${p.id}`}>
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">{t.common.view}</span>
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}