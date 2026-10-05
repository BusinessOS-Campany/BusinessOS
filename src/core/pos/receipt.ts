import type { ReceiptData, ReceiptBranding, ReceiptWidth, ReceiptTemplate } from "./types";

const WIDTH_MAP: Record<ReceiptWidth, number> = {
  "58mm": 384,
  "80mm": 576,
  a4: 794,
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateReceipt(
  data: ReceiptData,
  branding: ReceiptBranding,
  width: ReceiptWidth,
  rtl: boolean = false,
): ReceiptTemplate {
  const px = WIDTH_MAP[width];
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const orgName = rtl ? branding.orgNameAr : branding.orgNameEn;
  const fontStack = rtl ? "'Noto Sans Arabic', 'Segoe UI', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif";

  const isThermal = width !== "a4";

  const rows = data.items
    .map(
      (item) => `
      <tr>
        <td style="text-align:${align};padding:3px 0;font-size:${isThermal ? "11px" : "12px"};">${esc(item.name)}</td>
        <td style="text-align:center;padding:3px 0;white-space:nowrap;">${item.qty}</td>
        <td style="text-align:right;padding:3px 0;white-space:nowrap;">${fmtMoney(item.unitPrice)}</td>
        <td style="text-align:right;padding:3px 0;font-weight:600;white-space:nowrap;">${fmtMoney(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${rtl ? "ar" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Receipt ${esc(data.number)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{width:${px}px;font-family:${fontStack};color:#1a1a1a;background:#fff;padding:${isThermal ? "8px" : "24px"};font-size:${isThermal ? "12px" : "13px"};}
  @media print{body{padding:0;}}
  .header{text-align:center;margin-bottom:${isThermal ? "6px" : "16px"};border-bottom:2px solid ${branding.primaryColor};padding-bottom:${isThermal ? "4px" : "12px"};}
  .header .org{font-size:${isThermal ? "16px" : "22px"};font-weight:700;color:${branding.primaryColor};}
  .header .sub{font-size:${isThermal ? "10px" : "12px"};color:#666;margin-top:2px;}
  .info{margin:${isThermal ? "4px" : "10px"} 0;}
  .info dt{display:inline;font-weight:600;}
  .info dd{display:inline;margin:0;font-weight:400;}
  table{width:100%;border-collapse:collapse;margin:${isThermal ? "4px" : "10px"} 0;}
  thead th{border-bottom:1px solid #ccc;font-size:${isThermal ? "10px" : "11px"};text-transform:uppercase;color:#666;padding:2px 0;}
  .totals{border-top:2px solid #333;margin-top:${isThermal ? "4px" : "10px"};padding-top:${isThermal ? "4px" : "8px"};}
  .totals .row{display:flex;justify-content:space-between;padding:2px 0;}
  .totals .row.total{font-size:${isThermal ? "16px" : "18px"};font-weight:700;color:${branding.primaryColor};margin-top:4px;}
  .footer{text-align:center;margin-top:${isThermal ? "6px" : "16px"};padding-top:${isThermal ? "4px" : "10px"};border-top:1px dashed #ccc;font-size:${isThermal ? "10px" : "11px"};color:#888;}
  .qr{display:flex;justify-content:center;margin:${isThermal ? "6px" : "12px"} 0;}
</style>
</head>
<body>
  <div class="header">
    ${branding.logoDataUrl ? `<img src="${esc(branding.logoDataUrl)}" alt="logo" style="max-height:${isThermal ? "40px" : "60px"};margin-bottom:4px;"/>` : ""}
    <div class="org">${esc(orgName)}</div>
    <div class="sub">Receipt #${esc(data.number)}</div>
  </div>

  <dl class="info">
    <dt>Date: </dt><dd>${esc(data.issuedAt)}</dd>
    ${data.customerName ? `<br/><dt>Customer: </dt><dd>${esc(data.customerName)}</dd>` : ""}
    ${data.cashierName ? `<br/><dt>Cashier: </dt><dd>${esc(data.cashierName)}</dd>` : ""}
  </dl>

  <table>
    <thead><tr>
      <th style="text-align:${align}">Item</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Price</th>
      <th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmtMoney(data.subtotal)}</span></div>
    ${data.discountTotal > 0 ? `<div class="row"><span>Discount</span><span>-${fmtMoney(data.discountTotal)}</span></div>` : ""}
    ${data.taxTotal > 0 ? `<div class="row"><span>Tax</span><span>${fmtMoney(data.taxTotal)}</span></div>` : ""}
    <div class="row total"><span>Total</span><span>${fmtMoney(data.total)}</span></div>
    <div class="row"><span>Paid (Cash)</span><span>${fmtMoney(data.cashPaid)}</span></div>
    ${data.creditPortion > 0 ? `<div class="row"><span>Credit</span><span>${fmtMoney(data.creditPortion)}</span></div>` : ""}
  </div>

  <div class="footer">
    <p>Thank you for your purchase!</p>
    <p>${esc(orgName)}</p>
  </div>
</body>
</html>`;

  return { html, widthPx: px };
}
