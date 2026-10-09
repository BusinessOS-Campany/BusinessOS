import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string }> }) {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("audit:view");
  const { q = "", entity = "" } = await searchParams;

  const users = await prisma.user.findMany();
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const where = {
    ...(entity ? { entity } : {}),
    ...(q ? { OR: [{ entityId: { contains: q } }, { action: { contains: q } }] } : {}),
  };

  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });

  const entities = Array.from(new Set((await prisma.auditLog.findMany({ select: { entity: true }, take: 5000 })).map((l) => l.entity))).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "سجل التدقيق" : "Audit log"}
        description={locale === "ar" ? "سجل كامل لعمليات النظام (للقراءة فقط)" : "Append-only record of system activities"}
        actions={<PrintButton label={locale === "ar" ? "طباعة" : "Print"} />}
      />

      <form className="flex flex-wrap gap-3">
        <Input className="max-w-sm" name="q" defaultValue={q} placeholder={locale === "ar" ? "رقم المرجع أو العملية..." : "Reference or action..."} />
        <Select name="entity" defaultValue={entity}>
          <SelectTrigger className="w-48"><SelectValue placeholder={locale === "ar" ? "الكل" : "All entities"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{locale === "ar" ? "الكل" : "All"}</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="submit" className="hidden" />
      </form>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
              <TableHead>{locale === "ar" ? "المستخدم" : "User"}</TableHead>
              <TableHead>{locale === "ar" ? "العملية" : "Action"}</TableHead>
              <TableHead>{locale === "ar" ? "الكيان" : "Entity"}</TableHead>
              <TableHead>{locale === "ar" ? "المرجع" : "Reference"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-sm">{l.createdAt.toLocaleString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                <TableCell>{l.userId ? userMap.get(l.userId) ?? "—" : "—"}</TableCell>
                <TableCell><Badge variant="secondary">{l.action}</Badge></TableCell>
                <TableCell>{l.entity}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.entityId ?? "—"}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{locale === "ar" ? "لا توجد عمليات" : "No records"}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}