import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { getI18n } from "@/lib/i18n-server"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ClinicSettingsForm, type ClinicSettings } from "@/components/settings/clinic-settings-form"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const user = await requirePermission("settings:view")
  const { t, locale } = await getI18n()
  const ar = locale === "ar"

  const clinic = user.clinicId
    ? await prisma.clinic.findUnique({
        where: { id: user.clinicId },
        include: { branches: { orderBy: { name: "asc" } } },
      })
    : null

  if (!clinic) {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.page.noClinicLinked}</p>
      </div>
    )
  }

  const initial: ClinicSettings = {
    name: clinic.name,
    nameAr: clinic.nameAr,
    phone: clinic.phone,
    email: clinic.email,
    website: clinic.website,
    address: clinic.address,
    governorate: clinic.governorate,
    city: clinic.city,
    currency: clinic.currency,
    taxRate: String(clinic.taxRate),
    invoicePrefix: clinic.invoicePrefix,
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.page.clinicInfoHint}</p>
      </div>

      {user.permissions.includes("clinic:manage") ? (
        <Card>
          <ClinicSettingsForm initial={initial} />
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">{t.settings.name}</div>
              <div className="mt-1 font-medium">{ar && clinic.nameAr ? clinic.nameAr : clinic.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t.settings.phone}</div>
              <div className="mt-1 font-medium" dir="ltr">{clinic.phone ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t.settings.governorate}</div>
              <div className="mt-1 font-medium">{clinic.governorate ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t.settings.city}</div>
              <div className="mt-1 font-medium">{clinic.city ?? "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6">{t.settings.branches}</TableHead>
              <TableHead>{t.settings.address}</TableHead>
              <TableHead>{t.page.governorateCity}</TableHead>
              <TableHead>{t.settings.phone}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clinic.branches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  {t.page.noBranches}
                </TableCell>
              </TableRow>
            ) : (
              clinic.branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="px-6 font-medium">{ar && b.nameAr ? b.nameAr : b.name}</TableCell>
                  <TableCell className="text-sm">{b.address ?? "—"}</TableCell>
                  <TableCell className="text-sm">{[b.governorate, b.city].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell dir="ltr" className="text-sm">{b.phone ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}