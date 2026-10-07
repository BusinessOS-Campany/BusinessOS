import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getI18n } from "@/lib/i18n-server"
import { statusLabel } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { PlanStatusControls, type PlanProcedureLite } from "@/components/treatment-plans/plan-status-controls"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Props {
  params: Promise<{ id: string }>
}

export default async function TreatmentPlanDetailPage({ params }: Props) {
  const user = await requirePermission("treatmentPlans:view")
  const { id } = await params
  const { t, locale } = await getI18n()
  const ar = locale === "ar"

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
      dentist: { select: { user: { select: { name: true, nameAr: true } } } },
      procedures: { include: { procedure: { select: { code: true, nameEn: true, nameAr: true } } } },
    },
  })
  if (!plan) notFound()

  const patientName = [plan.patient.firstName, plan.patient.middleName, plan.patient.lastName].filter(Boolean).join(" ")
  const dentistName =
    plan.dentist?.user.nameAr && ar ? (plan.dentist.user.nameAr ?? plan.dentist.user.name) : plan.dentist?.user.name ?? "—"
  const c = statusColor(plan.status)

  const liteProcedures: PlanProcedureLite[] = plan.procedures.map((p) => ({
    id: p.id,
    status: p.status,
    nameEn: `${p.procedure.code} · ${ar ? p.procedure.nameAr : p.procedure.nameEn}`,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-4">
        <Button variant="ghost" asChild>
          <Link href="/treatment-plans">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t.page.backToPlans}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{locale === "ar" ? plan.nameAr : plan.nameEn}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description || t.page.noDescription}</p>
            </div>
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-sm" style={{ borderColor: c.border, color: c.text, background: c.bg }}>
              {statusLabel(t, plan.status)}
            </span>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t.treatmentPlans.patient}</p>
              <Link href={`/patients/${plan.patient.id}`} className="font-medium hover:underline">{patientName}</Link>
              <p className="text-xs text-muted-foreground">{plan.patient.patientNo}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.treatmentPlans.dentist}</p>
              <p className="font-medium">{dentistName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.treatmentPlans.estimatedCost}</p>
              <p className="font-medium tabular-nums">{formatCurrency(plan.estimatedCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.treatmentPlans.finalCost}</p>
              <p className="font-medium tabular-nums">{formatCurrency(plan.finalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.treatmentPlans.discount}</p>
              <p className="tabular-nums">{formatCurrency(plan.discount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.treatmentPlans.createdAt}</p>
              <p>{formatDate(plan.createdAt, locale)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t.treatmentPlans.procedures}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.treatmentPlans.procedure}</TableHead>
                    <TableHead>{t.treatmentPlans.tooth}</TableHead>
                    <TableHead className="text-center">{t.treatmentPlans.quantity}</TableHead>
                    <TableHead className="text-end">{t.treatmentPlans.unitPrice}</TableHead>
                    <TableHead className="text-end">{t.treatmentPlans.discount}</TableHead>
                    <TableHead className="text-end">{t.common.total}</TableHead>
                    <TableHead>{t.treatmentPlans.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.procedures.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        {t.treatmentPlans.noPlanProcedures}
                      </TableCell>
                    </TableRow>
                  ) : (
                    plan.procedures.map((p) => {
                      const pc = statusColor(p.status)
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <p className="font-medium">{p.procedure.code}</p>
                            <p className="text-xs text-muted-foreground">{ar ? p.procedure.nameAr : p.procedure.nameEn}</p>
                          </TableCell>
                          <TableCell>{p.toothNumber ?? "—"}</TableCell>
                          <TableCell className="text-center tabular-nums">{p.quantity}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatCurrency(p.unitPrice)}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatCurrency(p.discount)}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatCurrency(p.total)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: pc.border, color: pc.text, background: pc.bg }}>
                              {statusLabel(t, p.status)}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator className="my-4" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.page.planTotal}</span>
              <span className="text-lg font-semibold tabular-nums">{formatCurrency(plan.finalCost)}</span>
            </div>

            {user.permissions.includes("treatmentPlans:edit") && (
              <>
                <Separator className="my-4" />
                <PlanStatusControls planId={plan.id} status={plan.status} procedures={liteProcedures} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}