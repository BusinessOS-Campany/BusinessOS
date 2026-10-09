import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { fmtDate, fmtMoney } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAuth();
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);

  const invoice = await prisma.salesInvoice.findUnique({ where: { id } });
  if (!invoice) notFound();

  const [items, setting, customer] = await Promise.all([
    prisma.salesInvoiceItem.findMany({ where: { invoiceId: id } }),
    prisma.setting.findUnique({ where: { key: "pharmacy" } }),
    invoice.customerId ? prisma.customer.findUnique({ where: { id: invoice.customerId } }) : Promise.resolve(null),
  ]);

  const medIds = items.map((i) => i.medicineId);
  const meds = await prisma.medicine.findMany({ where: { id: { in: medIds } }, select: { id: true, nameAr: true, nameEn: true } });
  const medMap = new Map(meds.map((m) => [m.id, m]));
  const s = (setting?.value ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-sm p-4 text-sm print:p-0" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="text-center">
        <h1 className="text-lg font-bold">{String(s.nameAr ?? "الصيدلية")}</h1>
        {s.address ? <p className="text-xs text-muted-foreground">{String(s.address)}</p> : null}
        {s.phone ? <p className="text-xs text-muted-foreground">{String(s.phone)}</p> : null}
      </div>
      <div className="my-3 border-y py-2 text-xs">
        <div className="flex justify-between">
          <span>{locale === "ar" ? "رقم الفاتورة" : "Invoice"}</span>
          <span className="font-medium">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{locale === "ar" ? "التاريخ" : "Date"}</span>
          <span>{fmtDate(invoice.issuedAt, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span>{locale === "ar" ? "العميل" : "Customer"}</span>
          <span>{customer?.name ?? (locale === "ar" ? "عميل نقدي" : "Walk-in")}</span>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="py-1 text-start">{locale === "ar" ? "الصنف" : "Item"}</th>
            <th className="py-1 text-center">{locale === "ar" ? "الكمية" : "Qty"}</th>
            <th className="py-1 text-end">{locale === "ar" ? "الإجمالي" : "Total"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const m = medMap.get(it.medicineId);
            return (
              <tr key={it.id} className="border-b border-dashed">
                <td className="py-1">
                  {locale === "ar" ? m?.nameAr : m?.nameEn ?? m?.nameAr}
                </td>
                <td className="py-1 text-center">{Number(it.qty)}</td>
                <td className="py-1 text-end">{fmtMoney(it.lineTotal, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 space-y-1 border-t pt-2 text-xs">
        <div className="flex justify-between">
          <span>{locale === "ar" ? "المجموع" : "Subtotal"}</span>
          <span>{fmtMoney(invoice.subtotal, locale)}</span>
        </div>
        {invoice.discountTotal > 0n ? (
          <div className="flex justify-between">
            <span>{locale === "ar" ? "الخصم" : "Discount"}</span>
            <span>-{fmtMoney(invoice.discountTotal, locale)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-bold">
          <span>{locale === "ar" ? "الإجمالي" : "Total"}</span>
          <span>{fmtMoney(invoice.total, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span>{locale === "ar" ? "المدفوع" : "Paid"}</span>
          <span>{fmtMoney(invoice.paidTotal, locale)}</span>
        </div>
        {invoice.total - invoice.paidTotal > 0n ? (
          <div className="flex justify-between text-destructive">
            <span>{locale === "ar" ? "المتبقي" : "Due"}</span>
            <span>{fmtMoney(invoice.total - invoice.paidTotal, locale)}</span>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {String(s.footerNoteAr ?? (locale === "ar" ? "شكراً لزيارتكم" : "Thank you"))}
      </p>
      <div className="mt-4 text-center">
        <PrintButton label={locale === "ar" ? "طباعة" : "Print"} />
      </div>
    </div>
  );
}