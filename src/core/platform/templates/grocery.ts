import type { ModuleName } from "@/core/permissions/catalog";

/**
 * Industry templates applied at tenant provisioning. They pre-configure
 * enabled modules + default settings so a new tenant is usable immediately.
 * M4 will extend these with industry starter catalogs (products, units…).
 */
export interface TenantTemplate {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  /** Modules switched on for tenants provisioned with this template. */
  modules: ModuleName[];
  settings: Record<string, unknown>;
}

export const GROCERY_TEMPLATE: TenantTemplate = {
  code: "grocery",
  nameAr: "بقالة / سوبرماركت",
  nameEn: "Grocery / Supermarket",
  descriptionAr: "نظام إدارة بقالة وسوبرماركت مع نقاط بيع وإدارة مخزون",
  descriptionEn: "Grocery & supermarket management with POS and inventory tracking",
  icon: "shopping-cart",
  modules: [
    "products",
    "inventory",
    "sales",
    "purchases",
    "customers",
    "suppliers",
    "expenses",
    "finance",
    "reports",
    "pos",
    "settings",
    "users",
    "audit",
  ],
  settings: {
    currency: "SAR",
    taxRateBps: 1500, // 15% VAT, basis points (integer math only)
    priceIncludesTax: true,
    weightUnit: "kg",
    scaleBarcodesEnabled: true,
    receipt: {
      widthMm: 80,
      footerAr: "شكرًا لزيارتكم",
      footerEn: "Thank you for shopping with us",
      showBarcodeOnReceipt: true,
    },
  },
};

export const SCHOOL_TEMPLATE: TenantTemplate = {
  code: "school",
  nameAr: "مدرسة / تعليم",
  nameEn: "School / Education",
  descriptionAr: "نظام إدارة مدرسي للرسوم الدراسية والمصروفات والتقارير",
  descriptionEn: "School management for fees, expenses, and financial reports",
  icon: "graduation-cap",
  modules: [
    "products",
    "customers",
    "sales",
    "expenses",
    "finance",
    "reports",
    "settings",
    "users",
    "audit",
  ],
  settings: {
    currency: "SAR",
    taxRateBps: 0,
    priceIncludesTax: false,
    weightUnit: "kg",
    scaleBarcodesEnabled: false,
    receipt: {
      widthMm: 80,
      footerAr: "sądًا لتعليم أبنائكم",
      footerEn: "Thank you for trusting us with your children's education",
      showBarcodeOnReceipt: false,
    },
  },
};

export const RESTAURANT_TEMPLATE: TenantTemplate = {
  code: "restaurant",
  nameAr: "مطعم / معديات",
  nameEn: "Restaurant / Food Service",
  descriptionAr: "نظام إدارة مطعم مع نقطة بيع وإدارة مخزون المكونات",
  descriptionEn: "Restaurant management with POS and ingredient inventory",
  icon: "utensils",
  modules: [
    "products",
    "inventory",
    "sales",
    "purchases",
    "customers",
    "suppliers",
    "expenses",
    "finance",
    "reports",
    "pos",
    "settings",
    "users",
    "audit",
  ],
  settings: {
    currency: "SAR",
    taxRateBps: 1500,
    priceIncludesTax: true,
    weightUnit: "kg",
    scaleBarcodesEnabled: false,
    receipt: {
      widthMm: 80,
      footerAr: "شكرًا لزيارتكم",
      footerEn: "Thank you for dining with us",
      showBarcodeOnReceipt: false,
    },
  },
};

export const CLINIC_TEMPLATE: TenantTemplate = {
  code: "clinic",
  nameAr: "عيادة / صيدلية",
  nameEn: "Clinic / Pharmacy",
  descriptionAr: "نظام إدارة عيادة أو صيدلية مع إدارة الأدوية والمرضى",
  descriptionEn: "Clinic & pharmacy management with medication and patient tracking",
  icon: "heart-pulse",
  modules: [
    "products",
    "inventory",
    "sales",
    "purchases",
    "customers",
    "suppliers",
    "expenses",
    "finance",
    "reports",
    "settings",
    "users",
    "audit",
  ],
  settings: {
    currency: "SAR",
    taxRateBps: 1500,
    priceIncludesTax: true,
    weightUnit: "kg",
    scaleBarcodesEnabled: false,
    receipt: {
      widthMm: 80,
      footerAr: "شكرًا لثقتكم بنا",
      footerEn: "Thank you for trusting us",
      showBarcodeOnReceipt: false,
    },
  },
};

export const RETAIL_TEMPLATE: TenantTemplate = {
  code: "retail",
  nameAr: "تجزئة / متجر عام",
  nameEn: "Retail / General Store",
  descriptionAr: "نظام إدارة متجر تجزئة مع نقاط بيع وإدارة المنتجات",
  descriptionEn: "Retail store management with POS and product catalog",
  icon: "store",
  modules: [
    "products",
    "inventory",
    "sales",
    "purchases",
    "customers",
    "suppliers",
    "expenses",
    "finance",
    "reports",
    "pos",
    "settings",
    "users",
    "audit",
  ],
  settings: {
    currency: "SAR",
    taxRateBps: 1500,
    priceIncludesTax: true,
    weightUnit: "kg",
    scaleBarcodesEnabled: false,
    receipt: {
      widthMm: 80,
      footerAr: "شكرًا لزيارتكم",
      footerEn: "Thank you for shopping with us",
      showBarcodeOnReceipt: false,
    },
  },
};

export const TEMPLATES = {
  grocery: GROCERY_TEMPLATE,
  school: SCHOOL_TEMPLATE,
  restaurant: RESTAURANT_TEMPLATE,
  clinic: CLINIC_TEMPLATE,
  retail: RETAIL_TEMPLATE,
} as const;

export type TemplateCode = keyof typeof TEMPLATES;

export function getTemplate(code: string | null | undefined): TenantTemplate | null {
  if (!code) return null;
  return code in TEMPLATES ? TEMPLATES[code as TemplateCode] : null;
}

export const TEMPLATE_LIST = Object.values(TEMPLATES);
