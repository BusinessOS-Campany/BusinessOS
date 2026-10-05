import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ClinicSettingsForm, type ClinicSettings } from "@/components/settings/clinic-settings-form"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const user = await requirePermission("settings:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
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
        <h1 className="text-2xl font-bold tracking-tight">{ar ? "الإعدادات" : "Settings"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{ar ? "لا توجد عيادة مرتبطة بهذا الحساب" : "No clinic is linked to this account"}</p>
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
        <h1 className="text-2xl font-bold tracking-tight">{ar ? "الإعدادات" : "Settings"}</h1>
        <p className="text-sm text-muted-foreground">{ar ? "بيانات العيادة والفروع" : "Clinic information and branches"}</p>
      </div>

      {user.permissions.includes("clinic:manage") ? (
        <Card>
          <ClinicSettingsForm initial={initial} />
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">{ar ? "اسم العيادة" : "Clinic name"}</div>
              <div className="mt-1 font-medium">{ar && clinic.nameAr ? clinic.nameAr : clinic.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{ar ? "الهاتف" : "Phone"}</div>
              <div className="mt-1 font-medium" dir="ltr">{clinic.phone ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{ar ? "المحافظة" : "Governorate"}</div>
              <div className="mt-1 font-medium">{clinic.governorate ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{ar ? "المدينة" : "City"}</div>
              <div className="mt-1 font-medium">{clinic.city ?? "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6">{ar ? "الفروع" : "Branches"}</TableHead>
              <TableHead>{ar ? "العنوان" : "Address"}</TableHead>
              <TableHead>{ar ? "المحافظة / المدينة" : "Governorate / City"}</TableHead>
              <TableHead>{ar ? "الهاتف" : "Phone"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clinic.branches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  {ar ? "لا توجد فروع" : "No branches"}
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