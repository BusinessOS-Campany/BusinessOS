// Live standalone demo systems — proxied same-origin (see next.config rewrites).
// Plain data module (no "use client") so both server pages and client cards
// can import it.
export const DEMO_SYSTEMS: {
  key: string;
  emoji: string;
  name: string;
  nameEn: string;
  descriptionAr: string;
  href: string;
}[] = [
  { key: "grocery", emoji: "🛒", name: "نظام بقاله", nameEn: "Grocery System", descriptionAr: "منتجات وباركود وموردين وعملاء وتقارير ربح للبقالة", href: "/grocery" },
  { key: "clinic", emoji: "🩺", name: "نظام علاج طبيعي", nameEn: "Physical Therapy System", descriptionAr: "إدارة المرضى والجلسات والمواعيد والمدفوعات", href: "/sama" },
  { key: "cafe", emoji: "☕", name: "نظام اداره المقاهي", nameEn: "Cafe Management System", descriptionAr: "أجهزة وجلسات وشحن ورواتب وتقارير يومية", href: "/celia" },
  { key: "hospital", emoji: "🏥", name: "نظام المستشفى", nameEn: "Hospital System", descriptionAr: "المرضى والمواعيد والأسرّة والفواتير والأقسام الطبية", href: "/hospital" },
  { key: "dental", emoji: "🦷", name: "نظام عيادة اسنان", nameEn: "Dental Clinic System", descriptionAr: "المرضى والمواعيد والحشوات والفواتير والمختبر", href: "/dental" },
  { key: "pharmacy", emoji: "💊", name: "نظام صيدلية", nameEn: "Pharmacy System", descriptionAr: "الأدوية والمخزون والوصفات الطبية والفواتير", href: "/pharmacy" },
  { key: "laboratory", emoji: "🔬", name: "نظام المختبر", nameEn: "Laboratory System", descriptionAr: "الفحوصات والعينات والنتائج والأقسام والفواتير", href: "/laboratory" },
  { key: "optometry", emoji: "👁️", name: "نظام عيادة العيون", nameEn: "Eye Clinic System", descriptionAr: "الفحوصات البصرية ووصفات النظارات والعدسات", href: "/optometry" },
  { key: "pos", emoji: "💳", name: "نظام نقاط البيع", nameEn: "POS System", descriptionAr: "نقطة بيع سريعة مع باركود والمخازن والصندوق", href: "/pos" },
];