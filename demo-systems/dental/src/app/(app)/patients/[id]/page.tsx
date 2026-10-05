import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { Pencil } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DentalChartView } from "@/components/dental-chart/dental-chart-view"
import type { ToothRecordDTO } from "@/components/dental-chart/condition-editor-dialog"
import { PatientFormDialog, type PatientFormValues } from "@/components/patients/patient-form-dialog"
import { calcAge, formatCurrency, formatDate } from "@/lib/format"
import { GOVERNORATES } from "@/lib/constants/yemen"
import { statusColor } from "@/lib/status-ui"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"

interface Props {
  params: Promise<{ id: string }>
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase()
}

function govAr(en: string | null) {
  if (!en) return "—"
  const g = GOVERNORATES.find((x) => x.en === en)
  return g?.ar ?? en
}

export default async function PatientDetailPage({ params }: Props) {
  const user = await requirePermission("patients:view")
  const { id } = await params
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      medicalHistory: true,
      dentalHistory: true,
      appointments: {
        orderBy: [{ date: "desc" }, { startTime: "desc" }],
        take: 8,
        include: {
          dentist: { select: { user: { select: { name: true, nameAr: true } } } },
          branch: { select: { name: true, nameAr: true } },
        },
      },
      invoices: {
        orderBy: { issueDate: "desc" },
        take: 8,
      },
      toothRecords: {
        take: 32,
        include: { conditions: true },
      },
    },
  })

  if (!patient || patient.deletedAt) notFound()

  const age = calcAge(patient.dateOfBirth)
  const balance = patient.invoices.reduce((s, i) => s + Number(i.remaining), 0)
  const totalPaid = patient.invoices.reduce((s, i) => s + Number(i.paid), 0)
  const canEditChart = user.permissions.includes("dentalChart:edit")

  const toothRecordsDto: ToothRecordDTO[] = patient.toothRecords.map((tr) => ({
    id: tr.id,
    toothNumber: tr.toothNumber,
    dentition: tr.dentition as "ADULT" | "PRIMARY",
    conditions: tr.conditions.map((c) => ({
      id: c.id,
      condition: c.condition,
      surfaces: c.surfaces,
      severity: c.severity ? (c.severity as string) : null,
      notes: c.notes,
      date: c.date.toISOString(),
    })),
  }))

  const editInitial: Partial<PatientFormValues> = {
    firstName: patient.firstName,
    middleName: patient.middleName ?? "",
    lastName: patient.lastName,
    gender: patient.gender,
    dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : "",
    phone: patient.phone ?? "",
    whatsapp: patient.whatsapp ?? "",
    governorate: patient.governorate ?? "",
    city: patient.city ?? "",
  }

  const info: [string, string][] = [
    ["Patient No.", patient.patientNo],
    ["Gender", patient.gender === "MALE" ? "Male" : "Female"],
    ...(age !== null ? ([["Age", String(age)]] as [string, string][]) : []),
    ...(patient.nationalId ? ([["National ID", patient.nationalId]] as [string, string][]) : []),
    ["Nationality", patient.nationality],
    ["Governorate", patient.governorate ? govAr(patient.governorate) : "—"],
    ["City", patient.city ?? "—"],
    ...(patient.occupation ? ([["Occupation", patient.occupation]] as [string, string][]) : []),
    ["Email", patient.email ?? "—"],
  ]

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-base text-primary">
              {initials(`${patient.firstName} ${patient.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {patient.firstName} {patient.middleName ? `${patient.middleName} ` : ""}{patient.lastName}
              </h1>
              {patient.isActive ? (
                <Badge className="bg-emerald-600/10 text-emerald-700">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {patient.patientNo} • {patient.phone ? <span dir="ltr">{patient.phone}</span> : "No phone"}
            </p>
          </div>
        </div>

        {user.permissions.includes("patients:edit") && (
          <PatientFormDialog
            mode="edit"
            patientId={patient.id}
            initial={editInitial}
            trigger={
              <Button variant="outline">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            }
          />
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Appointments</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{patient.appointments.length}+</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(totalPaid)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-600">{formatCurrency(balance)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Tooth Records</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{patient.toothRecords.length}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Personal Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                  {info.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contact & Emergency</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                    <div className="contents">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd className="font-medium" dir="ltr">{patient.phone ?? "—"}</dd>
                    </div>
                    <div className="contents">
                      <dt className="text-muted-foreground">WhatsApp</dt>
                      <dd className="font-medium" dir="ltr">{patient.whatsapp ?? "—"}</dd>
                    </div>
                    <div className="contents">
                      <dt className="text-muted-foreground">Emergency contact</dt>
                      <dd className="font-medium">{patient.emergencyContactName ?? "—"}</dd>
                    </div>
                    <div className="contents">
                      <dt className="text-muted-foreground">Emergency phone</dt>
                      <dd className="font-medium" dir="ltr">{patient.emergencyContactPhone ?? "—"}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Medical History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {patient.medicalHistory ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {patient.medicalHistory.diabetes && <Badge>Diabetes</Badge>}
                        {patient.medicalHistory.hypertension && <Badge>Hypertension</Badge>}
                        {patient.medicalHistory.heartDisease && <Badge>Heart disease</Badge>}
                        {patient.medicalHistory.bleedingDisorder && <Badge>Bleeding disorder</Badge>}
                        {patient.medicalHistory.pregnancy && <Badge>Pregnancy</Badge>}
                      </div>
                      {patient.medicalHistory.allergies.length > 0 && (
                        <p>
                          <span className="text-muted-foreground">Allergies: </span>
                          <span className="text-destructive">{patient.medicalHistory.allergies.join(", ")}</span>
                        </p>
                      )}
                      {patient.medicalHistory.notes && (
                        <p className="text-muted-foreground">{patient.medicalHistory.notes}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">No medical history recorded.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardContent className="pt-0">
              {patient.appointments.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No appointments yet.</p>
              ) : (
                <div className="divide-y">
                  {patient.appointments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{formatDate(a.date)}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.startTime} – {a.endTime} • {a.dentist?.user.name ?? "Unassigned"}
                        </p>
                      </div>
                      <Badge style={{ borderColor: statusColor(a.status).border, color: statusColor(a.status).text }}>
                        {a.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardContent className="pt-0">
              {patient.invoices.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="divide-y">
                  {patient.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{inv.invoiceNo}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(inv.issueDate)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">{formatCurrency(Number(inv.total))}</span>
                        <Badge style={{ borderColor: statusColor(inv.status).border, color: statusColor(inv.status).text }}>
                          {inv.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinical">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dental Records</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {patient.dentalHistory ? (
                <div className="space-y-2 text-sm">
                  {patient.dentalHistory.previousTreatment && (
                    <p><span className="text-muted-foreground">Previous treatment: </span>{patient.dentalHistory.previousTreatment}</p>
                  )}
                  {patient.dentalHistory.previousExtractions && (
                    <p><span className="text-muted-foreground">Extractions: </span>{patient.dentalHistory.previousExtractions}</p>
                  )}
                  {patient.dentalHistory.oralHygiene && (
                    <p><span className="text-muted-foreground">Oral hygiene: </span>{patient.dentalHistory.oralHygiene}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No dental history recorded.</p>
              )}

              <Separator className="my-4" />

              <p className="mb-3 text-xs font-medium text-muted-foreground">
                {locale === "ar" ? "مخطط الأسنان" : "Dental Chart"}
              </p>
              <DentalChartView
                patientId={patient.id}
                records={toothRecordsDto}
                canEdit={canEditChart}
                locale={locale}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}