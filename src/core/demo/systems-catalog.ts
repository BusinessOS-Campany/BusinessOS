/**
 * Business Systems catalog shown on the /demo marketplace.
 *
 * Single source of truth for every system card (196 entries across 19
 * categories). Rendered by <=SystemsMarketplace/>= — never hard-code cards.
 *
 * `status` is one of:
 *  - "available": a real routed demo exists (href) and the card links out.
 *  - "soon":      not built yet — card shows a "coming soon" state (no fake link).
 *  - "dev":       being built — treated like "soon" but shows a distinct label.
 */

import { DEMO_SYSTEMS } from "./demo-systems";

export type SystemStatus = "available" | "soon" | "dev";

export interface BusinessSystem {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  category: string;
  icon: string;
  status: SystemStatus;
  href?: string;
}

export interface SystemCategory {
  id: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: string;
}

export const CATEGORIES: SystemCategory[] = [
  { id: "health", titleAr: "الرعاية الصحية", titleEn: "Healthcare", descAr: "أنظمة إدارة العيادات والمستشفيات والمختبرات والصيدليات.", descEn: "Systems for clinics, hospitals, labs and pharmacies.", icon: "hospital" },
  { id: "retail", titleAr: "متاجر التجزئة", titleEn: "Retail & Shops", descAr: "أنظمة البيع ونقاط البيع للمتاجر والمحلات في كل القطاعات.", descEn: "POS and store management for every retail segment.", icon: "store" },
  { id: "food", titleAr: "المطاعم والمقاهي", titleEn: "Restaurants & Food", descAr: "إدارة المطاعم والمقاهي والمخابز وسلاسل الطعام.", descEn: "Manage restaurants, cafés, bakeries and food chains.", icon: "utensils" },
  { id: "hotel", titleAr: "الضيافة والفنادق", titleEn: "Hospitality", descAr: "أنظمة الفنادق والمنتجعات والإيجارات والشقق المفروشة.", descEn: "Hotels, resorts, rentals and furnished apartments.", icon: "hotel" },
  { id: "finance", titleAr: "المالية والمحاسبة", titleEn: "Finance & Accounting", descAr: "الحسابات والرواتب والضرائب والتدفقات النقدية والتقارير المالية.", descEn: "Accounting, payroll, tax, cash flow and financial reporting.", icon: "wallet" },
  { id: "construction", titleAr: "الإنشاءات والمقاولات", titleEn: "Construction", descAr: "إدارة المشاريع والمقاولين والمواد والمعدات والمواقع.", descEn: "Projects, contractors, materials, equipment and sites.", icon: "hardhat" },
  { id: "auto", titleAr: "السيارات", titleEn: "Automotive", descAr: "معارض وقطع غيار وكهرباء سيارات وخدمات السيارات.", descEn: "Dealerships, parts, garages, washes and vehicle services.", icon: "car" },
  { id: "edu", titleAr: "التعليم", titleEn: "Education", descAr: "أنظمة المدارس والمعاهد والجامعات والمراكز التدريبية.", descEn: "Schools, institutes, universities and training centers.", icon: "grad" },
  { id: "pro", titleAr: "الخدمات المهنية", titleEn: "Professional Services", descAr: "محاماة ومحاسبة واستشارات ووكالات تسويق وترجمة.", descEn: "Legal, accounting, consulting, agencies and translation.", icon: "briefcase" },
  { id: "estate", titleAr: "العقارات", titleEn: "Real Estate", descAr: "إدارة الأملاك والعقارات وتأجير وبيع وتملك العقارات.", descEn: "Property, leasing, sales and buildings management.", icon: "building" },
  { id: "logistics", titleAr: "الخدمات اللوجستية", titleEn: "Logistics & Transportation", descAr: "الشحن والتوصيل والمستودعات والمخزون وإدارة الأساطيل.", descEn: "Shipping, delivery, warehouses, inventory and fleets.", icon: "truck" },
  { id: "mfg", titleAr: "التصنيع", titleEn: "Manufacturing", descAr: "أنظمة الإنتاج والمصانع ومراقبة الجودة وخطط الإنتاج.", descEn: "Production, factories, quality and planning systems.", icon: "factory" },
  { id: "beauty", titleAr: "التجميل والعناية", titleEn: "Beauty & Personal Care", descAr: "صالونات ومراكز التجميل والمنتجعات والعناية الشخصية.", descEn: "Salons, beauty centers, spas and personal care.", icon: "scissors" },
  { id: "fitness", titleAr: "اللياقة والرياضة", titleEn: "Fitness & Sports", descAr: "أندية رياضية ومراكز لياقة ومدربون شخصيون وأحواض سباحة.", descEn: "Gyms, fitness, coaches, clubs and swimming pools.", icon: "dumbbell" },
  { id: "service", titleAr: "خدمات الأعمال", titleEn: "Service Businesses", descAr: "شركات النظافة والصيانة والكهرباء والسباكة والأمن.", descEn: "Cleaning, maintenance, plumbing, electrical and security.", icon: "wrench" },
  { id: "ecom", titleAr: "التجارة الإلكترونية", titleEn: "E-Commerce", descAr: "متاجر وأسواق إلكترونية وإدارة الطلبات والتوصيل.", descEn: "Shops, marketplaces, orders, sellers and delivery.", icon: "cart" },
  { id: "web", titleAr: "المواقع والمتاجر الإلكترونية", titleEn: "Websites & Online Stores", descAr: "بناء وإدارة المواقع والمتاجر والصفحات والحجوزات الإلكترونية.", descEn: "Build and manage websites, stores, pages and online bookings.", icon: "layout" },
  { id: "agri", titleAr: "الزراعة", titleEn: "Agriculture", descAr: "أنظمة المزارع والثروة الحيوانية والدواجن والري والمحاصيل.", descEn: "Farms, livestock, poultry, irrigation and crops.", icon: "wheat" },
  { id: "enterprise", titleAr: "المؤسسات", titleEn: "Enterprise", descAr: "أنظمة ERP وCRM والموارد البشرية وسير العمل للشركات.", descEn: "ERP, CRM, HR and workflow systems for companies.", icon: "landmark" },
];

/**
 * Live demo routes that already exist (same-origin proxied standalone systems).
 *
 * The paths themselves are not written here: they come from the demo registry,
 * so a card can never link to a mount that the platform does not actually serve.
 * A hand-written `"/grocery"` survived the move into the `/demo` namespace and
 * still linked to a redirect, which is exactly the drift this avoids.
 */
const LIVE_HREF: Record<string, string> = Object.fromEntries(
  DEMO_SYSTEMS.map((system) => [system.slug, system.rootPath]),
);

export function liveHref(key: string): string | undefined {
  return LIVE_HREF[key];
}

interface Seed {
  id: string;
  ara: string;
  en: string;
  descAr: string;
  descEn: string;
  cat: string;
  icon: string;
  status?: SystemStatus;
  live?: string;
}

const S: Seed[] = [
  // ── Healthcare (10) ────────────────────────────────────────────────────────
  { id: "clinic-management", ara: "نظام إدارة العيادات", en: "Clinic Management System", descAr: "إدارة المرضى والمواعيد والمدفوعات والملفات الطبية للعيادات.", descEn: "Patients, appointments, payments and medical records for clinics.", cat: "health", icon: "stethoscope", status: "available", live: "sama" },
  { id: "dental-clinic", ara: "نظام عيادة الأسنان", en: "Dental Clinic System", descAr: "إدارة المرضى والحشوات والتركيبات والمختبر وفواتير العيادات.", descEn: "Patients, fillings, labs and billing for dental clinics.", cat: "health", icon: "smile", status: "available", live: "dental" },
  { id: "hospital-management", ara: "نظام إدارة المستشفيات", en: "Hospital Management System", descAr: "إدارة المرضى والأقسام والأسرّة والمواعيد والعمليات.", descEn: "Patients, departments, beds, appointments and operations.", cat: "health", icon: "hospital", status: "available", live: "hospital" },
  { id: "pharmacy-management", ara: "نظام إدارة الصيدليات", en: "Pharmacy Management System", descAr: "المخزون الدوائي والوصفات والمنتجات وفواتير الصيدلية.", descEn: "Drug inventory, prescriptions, products and pharmacy billing.", cat: "health", icon: "pill", status: "available", live: "pharmacy" },
  { id: "laboratory", ara: "نظام إدارة المختبر", en: "Laboratory Management System", descAr: "إدارة الفحوصات والعينات والنتائج والأقسام في المختبر.", descEn: "Tests, samples, results and lab departments management.", cat: "health", icon: "microscope", status: "available", live: "laboratory" },
  { id: "med-center", ara: "نظام المركز الطبي", en: "Medical Center System", descAr: "إدارة شاملة للمراكز الطبية والعيادات والمواعيد والجلسات.", descEn: "Complete management for medical centers and clinics.", cat: "health", icon: "clinic", status: "available", live: "sama" },
  { id: "physiotherapy", ara: "نظام مركز العلاج الطبيعي", en: "Physiotherapy Center System", descAr: "إدارة الجلسات والمواعيد والمرضى والمدفوعات للمركز الصحي.", descEn: "Sessions, appointments, patients and payments for physio centers.", cat: "health", icon: "activity", status: "available", live: "sama" },
  { id: "veterinary", ara: "نظام العيادة البيطرية", en: "Veterinary Clinic System", descAr: "إدارة الحيوانات والعلاجات والملفات والتطعيمات للعيادات البيطرية.", descEn: "Animals, treatments, records and vaccines for vet clinics.", cat: "health", icon: "paw", status: "soon" },
  { id: "optometry", ara: "نظام عيادة العيون", en: "Optometry / Eye Clinic System", descAr: "إدارة المرضى والفحوصات البصرية ووصفات النظارات والعدسات.", descEn: "Patients, eye exams, glasses and lens prescriptions.", cat: "health", icon: "eye", status: "available", live: "optometry" },
  { id: "diagnostic-center", ara: "نظام مركز التشخيص", en: "Diagnostic Center System", descAr: "إدارة الأشعة والفحوصات ونتائجها للمراكز التشخيصية.", descEn: "Imaging, tests and results for diagnostic centers.", cat: "health", icon: "heart", status: "soon" },

  // ── Retail & Shops (12) ────────────────────────────────────────────────────
  { id: "pos", ara: "نظام نقاط البيع", en: "POS System", descAr: "نقاط بيع سريعة مع باركود والمخازن والمبيعات والصندوق.", descEn: "Fast POS with barcode, warehouses, sales and cash register.", cat: "retail", icon: "store", status: "available", live: "pos" },
  { id: "supermarket", ara: "نظام السوبر ماركت", en: "Supermarket Management System", descAr: "إدارة المنتجات والرفوف والموردين والمبيعات للسوبر ماركت.", descEn: "Products, shelves, suppliers and sales for supermarkets.", cat: "retail", icon: "bag", status: "soon" },
  { id: "grocery-store", ara: "نظام البقالة", en: "Grocery Store System", descAr: "منتجات وباركود وموردين وعملاء وتقارير ربح للبقالة.", descEn: "Products, barcodes, suppliers, customers and profit reports.", cat: "retail", icon: "cart", status: "available", live: "grocery" },
  { id: "clothing-store", ara: "نظام ملابس", en: "Clothing Store System", descAr: "إدارة المنتجات والمقاسات والألوان والمبيعات لمحل الملابس.", descEn: "Products, sizes, colors and sales for clothing stores.", cat: "retail", icon: "shirt", status: "soon" },
  { id: "electronics", ara: "نظام متجر الإلكترونيات", en: "Electronics Store System", descAr: "إدارة الأجهزة والضمانات والإصلاحات ومبيعات الإلكترونيات.", descEn: "Devices, warranties, repairs and electronics sales.", cat: "retail", icon: "cpu", status: "soon" },
  { id: "mobile-phone", ara: "نظام محل الجوالات", en: "Mobile Phone Shop System", descAr: "إدارة الجوالات والملحقات وتصليح الجوالات واتفاقيات الشركات.", descEn: "Phones, accessories, repairs and corporate agreements.", cat: "retail", icon: "smartphone", status: "soon" },
  { id: "furniture", ara: "نظام الأثاث", en: "Furniture Store System", descAr: "إدارة المعروضات والطلبات الخاصة والتسليم لمحل الأثاث.", descEn: "Showroom, custom orders and deliveries for furniture.", cat: "retail", icon: "sofa", status: "soon" },
  { id: "jewelry", ara: "نظام المجوهرات", en: "Jewelry Store System", descAr: "إدارة القطع والأوزان والأسعار والمسابك لمحل المجوهرات.", descEn: "Pieces, weights, pricing and workshops for jewelers.", cat: "retail", icon: "gem", status: "soon" },
  { id: "cosmetics", ara: "نظام مستحضرات التجميل", en: "Cosmetics Store System", descAr: "إدارة المنتجات ومستحضرات التجميل والمبيعات للمحلات.", descEn: "Products, cosmetics and sales for beauty retailers.", cat: "retail", icon: "spray", status: "soon" },
  { id: "bookstore", ara: "نظام المكتبة", en: "Bookstore System", descAr: "إدارة الكتب والأصناف والمؤلفين ومبيعات المكتبة.", descEn: "Books, categories, authors and bookstore sales.", cat: "retail", icon: "book", status: "soon" },
  { id: "hardware", ara: "نظام مواد البناء", en: "Hardware Store System", descAr: "إدارة العدد والمواد والموردين والمبيعات لمتجر العدد.", descEn: "Tools, materials, suppliers and sales for hardware stores.", cat: "retail", icon: "hammer", status: "soon" },
  { id: "car-parts", ara: "نظام قطع غيار السيارات", en: "Car Parts Store System", descAr: "إدارة قطع الغيار والأصناف والموديلات والمبيعات للمحلات.", descEn: "Parts, SKUs, car models and sales for parts shops.", cat: "retail", icon: "car", status: "soon" },
  { id: "pet-shop", ara: "نظام متجر الحيوانات الأليفة", en: "Pet Shop System", descAr: "إدارة الحيوانات والمستلزمات والمواعيد والعملاء لمحلات الحيوانات.", descEn: "Pets, supplies, grooming appointments and customers.", cat: "retail", icon: "paw", status: "soon" },
  { id: "sports-shop", ara: "نظام المتجر الرياضي", en: "Sports Store System", descAr: "إدارة الملابس والأدوات الرياضية والماركات والمبيعات.", descEn: "Sportswear, gear, brands and sales for sports stores.", cat: "retail", icon: "trophy", status: "soon" },
  { id: "shoe-store", ara: "نظام متجر الأحذية", en: "Shoe Store System", descAr: "إدارة المقاسات والموديلات والمخزون ومبيعات الأحذية.", descEn: "Sizes, models, stock and sales for shoe stores.", cat: "retail", icon: "footprints", status: "soon" },
  { id: "children-store", ara: "نظام متجر الأطفال", en: "Children's Store System", descAr: "إدارة ملابس وألعاب ومستلزمات الأطفال للمحلات المتخصصة.", descEn: "Kids' clothes, toys and supplies for specialty shops.", cat: "retail", icon: "baby", status: "soon" },
  { id: "gift-shop", ara: "نظام متجر الهدايا", en: "Gift Shop System", descAr: "إدارة الهدايا والتغليف والمناسبات والمبيعات لمحل الهدايا.", descEn: "Gifts, wrapping, occasions and sales for gift shops.", cat: "retail", icon: "gift", status: "soon" },
  { id: "perfume-shop", ara: "نظام متجر العطور", en: "Perfume Store System", descAr: "إدارة العطور والماركات والتركيزات والمبيعات للمحلات.", descEn: "Fragrances, brands, concentrations and sales.", cat: "retail", icon: "spray", status: "soon" },
  { id: "watch-shop", ara: "نظام متجر الساعات", en: "Watch Store System", descAr: "إدارة الساعات والماركات والموديلات وخدمة الإصلاح.", descEn: "Watches, brands, models and repairs.", cat: "retail", icon: "clock", status: "soon" },
  { id: "flower-shop", ara: "نظام محل الورد", en: "Flower Shop System", descAr: "إدارة الورد والباقات والطلبات والتوصيل للمناسبات.", descEn: "Flowers, bouquets, orders and delivery.", cat: "retail", icon: "flower", status: "soon" },
  { id: "antique-shop", ara: "نظام متجر التحف", en: "Antiques & Souvenirs System", descAr: "إدارة التحف والتحف التذكارية والتقييم والمبيعات.", descEn: "Antiques, keepsakes, valuations and sales.", cat: "retail", icon: "gem", status: "soon" },
  { id: "art-gallery-shop", ara: "نظام متجر اللوحات الفنية", en: "Art Store & Gallery System", descAr: "إدارة اللوحات والفنانين والمعارض والمبيعات الفنية.", descEn: "Paintings, artists, exhibitions and art sales.", cat: "retail", icon: "palette", status: "soon" },
  { id: "event-store", ara: "نظام مستلزمات الحفلات", en: "Party Supplies Store System", descAr: "إدارة مستلزمات الحفلات والمناسبات والتأجير والمبيعات.", descEn: "Party supplies, occasions, rentals and sales.", cat: "retail", icon: "sparkles", status: "soon" },

  // ── Restaurants & Food (10) ────────────────────────────────────────────────
  { id: "restaurant", ara: "نظام المطاعم", en: "Restaurant Management System", descAr: "إدارة الطلبات والمائدة والمنيو والمطبخ وفواتير المطعم.", descEn: "Orders, tables, menu, kitchen and restaurant billing.", cat: "food", icon: "utensils", status: "soon" },
  { id: "cafe", ara: "نظام إدارة المقاهي", en: "Café Management System", descAr: "إدارة الجلسات والأجهزة والشحن والرواتب والتقارير للمقاهي.", descEn: "Sessions, devices, top-ups, payroll and café reports.", cat: "food", icon: "coffee", status: "available", live: "cafe" },
  { id: "fast-food", ara: "نظام الوجبات السريعة", en: "Fast Food Management System", descAr: "إدارة الطلبات السريعة والتراخيص والمنيو والمبيعات.", descEn: "Fast orders, drive-through, menus and sales.", cat: "food", icon: "fries", status: "soon" },
  { id: "bakery", ara: "نظام المخابز", en: "Bakery Management System", descAr: "إدارة الإنتاج اليومي والخبز والمنتجات والمبيعات للمخبز.", descEn: "Daily production, bread, products and bakery sales.", cat: "food", icon: "bread", status: "soon" },
  { id: "coffee-shop", ara: "نظام القهوة", en: "Coffee Shop System", descAr: "إدارة الطلبات والمشروبات والزبائن ونقاط البيع لمحل القهوة.", descEn: "Orders, drinks, customers and POS for coffee shops.", cat: "food", icon: "cup", status: "soon" },
  { id: "cloud-kitchen", ara: "نظام المطبخ السحابي", en: "Cloud Kitchen System", descAr: "إدارة طلبات التوصيل والمطبخ المركزي للمطابخ السحابية.", descEn: "Delivery orders and central kitchen for cloud kitchens.", cat: "food", icon: "flame", status: "soon" },
  { id: "catering", ara: "نظام التموين", en: "Catering Management System", descAr: "إدارة الحفلات وعروض التموين والطلبات والفواتير.", descEn: "Events, catering offers, orders and invoicing.", cat: "food", icon: "chefhat", status: "soon" },
  { id: "food-delivery", ara: "نظام توصيل الطعام", en: "Food Delivery Management System", descAr: "إدارة الطلبات والمندوبين والتوصيل لمنصات الطعام.", descEn: "Orders, riders and delivery for food platforms.", cat: "food", icon: "bike", status: "soon" },
  { id: "restaurant-pos", ara: "نظام نقاط بيع المطاعم", en: "Restaurant POS System", descAr: "نقاط بيع مخصصة للمطاعم مع المائدة والتراخيص والطابعات.", descEn: "Restaurant POS with tables, drive-through and printers.", cat: "food", icon: "monitor", status: "soon" },
  { id: "table-reservation", ara: "نظام حجز الطاولات", en: "Table Reservation System", descAr: "إدارة الحجوزات والطاولات والانتظار للمطاعم والمقاهي.", descEn: "Reservations, tables and waitlist for restaurants.", cat: "food", icon: "calendar", status: "soon" },

  // ── Hospitality (8) ────────────────────────────────────────────────────────
  { id: "hotel", ara: "نظام الفنادق", en: "Hotel Management System", descAr: "إدارة الغرف والحجوزات والضيوف والفوترة للفنادق.", descEn: "Rooms, reservations, guests and billing for hotels.", cat: "hotel", icon: "hotel", status: "soon" },
  { id: "motel", ara: "نظام النزل", en: "Motel Management System", descAr: "إدارة الوحدات والحجوزات والنزلاء للنزل الصغيرة.", descEn: "Units, reservations and lodgers for motels.", cat: "hotel", icon: "bed", status: "soon" },
  { id: "resort", ara: "نظام المنتجعات", en: "Resort Management System", descAr: "إدارة الشاليهات والخيام والمرافق والحجوزات للمنتجع.", descEn: "Villas, tents, amenities and bookings for resorts.", cat: "hotel", icon: "palm", status: "soon" },
  { id: "apartment-rental", ara: "نظام تأجير الشقق", en: "Apartment Rental System", descAr: "إدارة الشقق المفروشة والإيجار والتفاويض والصيانة.", descEn: "Furnished apartments, leases, handovers and maintenance.", cat: "hotel", icon: "building", status: "soon" },
  { id: "guest-house", ara: "نظام البيوت الضيافة", en: "Guest House Management System", descAr: "إدارة الأدوار والغرف والضيوف لبيوت الضيافة.", descEn: "Floors, rooms and guests for guest houses.", cat: "hotel", icon: "home", status: "soon" },
  { id: "hostel", ara: "نظام الأجنحة الطلابية", en: "Hostel Management System", descAr: "إدارة الغرف المشتركة والمقيمين والحجوزات للأجنحة.", descEn: "Dorms, residents and bookings for hostels.", cat: "hotel", icon: "people", status: "soon" },
  { id: "booking", ara: "نظام إدارة الحجوزات", en: "Booking Management System", descAr: "إدارة الحجوزات وقوائم الأسعار والإلغاءات لصناعة الضيافة.", descEn: "Bookings, rate plans and cancellations for hospitality.", cat: "hotel", icon: "calendar", status: "soon" },
  { id: "housekeeping", ara: "نظام التدبير المنزلي", en: "Housekeeping Management System", descAr: "إدارة النظافة وطاقم التدبير وحالة الغرف للفنادق.", descEn: "Cleaning, staff and room status for hotels.", cat: "hotel", icon: "sparkles", status: "soon" },

  // ── Finance & Accounting (10) ──────────────────────────────────────────────
  { id: "accounting", ara: "نظام المحاسبة", en: "Accounting System", descAr: "دليل الحسابات والقيود والميزانيات والتقارير المالية.", descEn: "Chart of accounts, entries, ledgers and financial reports.", cat: "finance", icon: "wallet", status: "soon" },
  { id: "expense", ara: "نظام المصاريف", en: "Expense Management System", descAr: "إدارة النفقات والفئات والمستندات والموافقات للشركة.", descEn: "Expenses, categories, documents and approvals.", cat: "finance", icon: "coins", status: "soon" },
  { id: "invoice", ara: "نظام الفواتير", en: "Invoice Management System", descAr: "إصدار وإدارة الفواتير والمتابعة والتحصيل والفوترة.", descEn: "Create, manage, track and collect invoices.", cat: "finance", icon: "receipt", status: "soon" },
  { id: "payroll", ara: "نظام الرواتب", en: "Payroll System", descAr: "حساب الرواتب والخصومات والبدلات وإدارة المسير المالي.", descEn: "Salary calc, deductions, allowances and payroll management.", cat: "finance", icon: "banknote", status: "soon" },
  { id: "tax", ara: "نظام الضرائب", en: "Tax Management System", descAr: "إدارة ضريبة القيمة المضافة والتقارير والفواتير الضريبية.", descEn: "VAT management, reports and tax invoices.", cat: "finance", icon: "percent", status: "soon" },
  { id: "cash-flow", ara: "نظام التدفق النقدي", en: "Cash Flow Management System", descAr: "متابعة التدفقات النقدية الداخلة والخارجة والتوقعات.", descEn: "Track inflows, outflows and cash forecasts.", cat: "finance", icon: "trend", status: "soon" },
  { id: "debt", ara: "نظام الديون", en: "Debt Management System", descAr: "إدارة الديون والعملاء والتحصيل وتقارير الأرصدة.", descEn: "Debts, customers, collections and balance reports.", cat: "finance", icon: "handshake", status: "soon" },
  { id: "installment", ara: "نظام الأقساط", en: "Installment Management System", descAr: "إدارة الأقساط والجدول الزمني والفوائد والدفعات.", descEn: "Installments, schedules, interest and payments.", cat: "finance", icon: "calendar", status: "soon" },
  { id: "budget", ara: "نظام الميزانيات", en: "Budget Management System", descAr: "إعداد ومتابعة الميزانيات والفروقات للأقسام والمشاريع.", descEn: "Budgets, tracking and variance by department or project.", cat: "finance", icon: "chart", status: "soon" },
  { id: "fin-reporting", ara: "نظام التقارير المالية", en: "Financial Reporting System", descAr: "تقارير مالية وتحليلية دقيقة للمركز والنتيجة: باستثناء...", descEn: "Accurate financial and analytical reporting.", cat: "finance", icon: "filetext", status: "soon" },

  // ── Construction (10) ──────────────────────────────────────────────────────
  { id: "construction-co", ara: "نظام شركات المقاولات", en: "Construction Company Management System", descAr: "إدارة المشاريع والعقود والموارد لشركات المقاولات.", descEn: "Projects, contracts and resources for contractors.", cat: "construction", icon: "hardhat", status: "soon" },
  { id: "construction-project", ara: "نظام إدارة مشاريع البناء", en: "Construction Project Management System", descAr: "إدارة المخططات والجداول والمهام والتسليمات للمشروع.", descEn: "Plans, schedules, tasks and deliveries for projects.", cat: "construction", icon: "compass", status: "soon" },
  { id: "contractor", ara: "نظام إدارة المقاولين", en: "Contractor Management System", descAr: "إدارة المقاولين والعقود والتقييمات والدفعات.", descEn: "Contractors, contracts, ratings and payments.", cat: "construction", icon: "handshake", status: "soon" },
  { id: "building-materials", ara: "نظام مواد البناء", en: "Building Materials Management System", descAr: "إدارة مخزون مواد البناء والموردين والطلبات.", descEn: "Building materials inventory, suppliers and orders.", cat: "construction", icon: "box", status: "soon" },
  { id: "construction-equipment", ara: "نظام المعدات الثقيلة", en: "Construction Equipment Management System", descAr: "إدارة المعدات والأسطول والصيانة والتأجير.", descEn: "Equipment, fleet, maintenance and rentals.", cat: "construction", icon: "tractor", status: "soon" },
  { id: "construction-worker", ara: "نظام إدارة العمال", en: "Construction Worker Management System", descAr: "إدارة العمال والحضور والرواتب ومهام الموقع.", descEn: "Labor, attendance, pay and site assignments.", cat: "construction", icon: "people", status: "soon" },
  { id: "construction-accounting", ara: "نظام محاسبة المقاولات", en: "Construction Accounting System", descAr: "المحاسبة للمشاريع والمستخلصات والتكاليف المباشرة.", descEn: "Project accounting, claims and direct costs.", cat: "construction", icon: "calc", status: "soon" },
  { id: "site", ara: "نظام إدارة الموقع", en: "Construction Site Management System", descAr: "إدارة مواقع التنفيذ والتقارير اليومية وسلامة الموقع.", descEn: "Sites, daily reports and site safety.", cat: "construction", icon: "map", status: "soon" },
  { id: "procurement", ara: "نظام المشتريات", en: "Procurement System", descAr: "إدارة طلبات الشراء والعطاءات والموردين والعقود.", descEn: "Purchase requests, bids, suppliers and contracts.", cat: "construction", icon: "truck", status: "soon" },
  { id: "estimation", ara: "نظام التسعير التقديري", en: "Construction Estimation System", descAr: "إعداد جداول الكميات والتقديرات والمناقصات.", descEn: "BOQs, estimates and tenders.", cat: "construction", icon: "ruler", status: "soon" },

  // ── Automotive (9) ─────────────────────────────────────────────────────────
  { id: "car-dealership", ara: "نظام معارض السيارات", en: "Car Dealership System", descAr: "إدارة المعروض والبيع والشراء والمستندات للمعارض.", descEn: "Stock, sales, purchases and documents for dealerships.", cat: "auto", icon: "car", status: "soon" },
  { id: "car-rental", ara: "نظام تأجير السيارات", en: "Car Rental System", descAr: "إدارة الأسطول والعقود والتأجير اليومي والسائقين.", descEn: "Fleet, contracts, daily rental and drivers.", cat: "auto", icon: "carfront", status: "soon" },
  { id: "auto-repair", ara: "نظام ورش السيارات", en: "Auto Repair / Garage System", descAr: "إدارة أمر الشغل وقطع الغيار والفنيين والفوترة للورش.", descEn: "Work orders, parts, technicians and garage billing.", cat: "auto", icon: "wrench", status: "soon" },
  { id: "car-wash", ara: "نظام غسيل السيارات", en: "Car Wash Management System", descAr: "إدارة الخدمات والاشتراكات والزبائن لمغاسل السيارات.", descEn: "Services, subscriptions and customers for car washes.", cat: "auto", icon: "droplets", status: "soon" },
  { id: "tire-shop", ara: "نظام محل الإطارات", en: "Tire Shop System", descAr: "إدارة الإطارات والأجناس والتركيب والمبيعات.", descEn: "Tires, sizes, fitting and sales for tire shops.", cat: "auto", icon: "circle", status: "soon" },
  { id: "spare-parts", ara: "نظام قطع الغيار", en: "Spare Parts Management System", descAr: "مخزون قطع الغيار للسيارات والاتوتراك والموديلات.", descEn: "Auto parts inventory across makes and models.", cat: "auto", icon: "settings", status: "soon" },
  { id: "vehicle-maintenance", ara: "نظام صيانة المركبات", en: "Vehicle Maintenance System", descAr: "إدارة صيانة الأسطول ومواعيد الخدمة والسجل.", descEn: "Fleet servicing, service schedules and records.", cat: "auto", icon: "gauge", status: "soon" },
  { id: "driving-school", ara: "نظام مدارس تعليم القيادة", en: "Driving School System", descAr: "إدارة الطلاب والدروس والمدربين والتسجيل والتدريب.", descEn: "Students, lessons, instructors and registrations.", cat: "auto", icon: "steering", status: "soon" },
  { id: "fleet-auto", ara: "نظام إدارة الأسطول", en: "Fleet Management System", descAr: "تتبع وإدارة الأسطول والوقود والمسارات والصيانة.", descEn: "Fleet tracking, fuel, routes and maintenance.", cat: "auto", icon: "truck", status: "soon" },

  // ── Education (10) ─────────────────────────────────────────────────────────
  { id: "school", ara: "نظام المدارس", en: "School Management System", descAr: "إدارة الطلاب والصفوف والدرجات والغيار والحضور.", descEn: "Students, classes, grades, schedules and attendance.", cat: "edu", icon: "school", status: "soon" },
  { id: "university", ara: "نظام الجامعات", en: "University Management System", descAr: "إدارة الكليات والمواد والدرجات والقبول الجامعي.", descEn: "Faculties, courses, grades and admissions.", cat: "edu", icon: "grad", status: "soon" },
  { id: "training-center", ara: "نظام مراكز التدريب", en: "Training Center System", descAr: "إدارة الدورات والمدربين والمسجلين والشهادات.", descEn: "Courses, trainers, enrollments and certificates.", cat: "edu", icon: "presentation", status: "soon" },
  { id: "institute", ara: "نظام المعاهد", en: "Institute Management System", descAr: "إدارة البرامج والمستويات والحضور لمعاهد التعليم.", descEn: "Programs, levels and attendance for institutes.", cat: "edu", icon: "book", status: "soon" },
  { id: "kindergarten", ara: "نظام رياض الأطفال", en: "Kindergarten Management System", descAr: "إدارة الأطفال والفصول والحضور والتواصل مع الأهل.", descEn: "Kids, classes, attendance and parent communication.", cat: "edu", icon: "baby", status: "soon" },
  { id: "student", ara: "نظام إدارة الطلاب", en: "Student Management System", descAr: "الملفات الأكاديمية والدرجات والسلوك للطلاب.", descEn: "Academic records, grades and behavior for students.", cat: "edu", icon: "users", status: "soon" },
  { id: "exam", ara: "نظام الامتحانات", en: "Exam Management System", descAr: "إعداد الجداول والأسئلة والتصحيح ونتائج الامتحانات.", descEn: "Schedules, papers, grading and exam results.", cat: "edu", icon: "clipboard", status: "soon" },
  { id: "online-course", ara: "نظام الدورات أونلاين", en: "Online Course Management System", descAr: "نشر وإدارة الدورات والمحتوى والطلاب أونلاين.", descEn: "Publish and manage courses, content and learners.", cat: "edu", icon: "monitor", status: "soon" },
  { id: "tuition", ara: "نظام الرسوم الدراسية", en: "Tuition Management System", descAr: "إدارة الرسوم والأقساط والخصومات وتحصيل المدارس.", descEn: "Fees, installments, discounts and school collections.", cat: "edu", icon: "wallet", status: "soon" },
  { id: "library", ara: "نظام المكتبات", en: "Library Management System", descAr: "إدارة الكتب والإعارة والتصنيف والزوار للمكتبة.", descEn: "Books, circulation, cataloging and visitors.", cat: "edu", icon: "library", status: "soon" },

  // ── Professional Services (10) ─────────────────────────────────────────────
  { id: "law-firm", ara: "نظام المحاماة", en: "Law Firm Management System", descAr: "إدارة القضايا والموكلين والجلسات والمواعيد للمحاماة.", descEn: "Cases, clients, hearings and deadlines for law firms.", cat: "pro", icon: "scale", status: "soon" },
  { id: "accounting-firm", ara: "نظام مكاتب المحاسبة", en: "Accounting Firm Management System", descAr: "إدارة حسابات العملاء والتدقيق والتقارير للمكاتب.", descEn: "Client books, audits and reports for accounting firms.", cat: "pro", icon: "calc", status: "soon" },
  { id: "consulting", ara: "نظام الاستشارات", en: "Consulting Company System", descAr: "إدارة المشاريع الاستشارية والاستشاريين والفوترة.", descEn: "Engagements, consultants and billing.", cat: "pro", icon: "briefcase", status: "soon" },
  { id: "marketing-agency", ara: "نظام وكالات التسويق", en: "Marketing Agency System", descAr: "إدارة الحملات والعملاء والمشاريع الإعلانية والنتائج.", descEn: "Campaigns, clients, deliverables and results.", cat: "pro", icon: "megaphone", status: "soon" },
  { id: "software-co", ara: "نظام شركات البرمجيات", en: "Software Company Management System", descAr: "إدارة المشاريع البرمجية والفرق والتسليم والفوترة.", descEn: "Engineering projects, teams, delivery and billing.", cat: "pro", icon: "code", status: "soon" },
  { id: "architecture-firm", ara: "نظام المكاتب الهندسية", en: "Architecture Firm System", descAr: "إدارة التصاميم والمخططات والمشاريع الهندسية.", descEn: "Designs, drawings and architectural projects.", cat: "pro", icon: "pencil", status: "soon" },
  { id: "engineering-firm", ara: "نظام الاستشارات الهندسية", en: "Engineering Firm System", descAr: "إدارة دراسات الجدوى والإشراف والمشاريع الهندسية.", descEn: "Feasibility, supervision and engineering projects.", cat: "pro", icon: "compass", status: "soon" },
  { id: "real-estate-agency", ara: "نظام الوكالات العقارية", en: "Real Estate Agency System", descAr: "إدارة الصفقات والعقارات والعملاء والعمولات.", descEn: "Deals, properties, clients and commissions.", cat: "pro", icon: "landmark", status: "soon" },
  { id: "hr-agency", ara: "نظام مكاتب التوظيف", en: "HR Agency System", descAr: "إدارة المرشحين والعقود والتوظيف للوكالات.", descEn: "Candidates, placements and contracts for agencies.", cat: "pro", icon: "users", status: "soon" },
  { id: "translation", ara: "نظام الترجمة", en: "Translation Agency System", descAr: "إدارة طلبات الترجمة والمترجمين والتسعير والتسليم.", descEn: "Translation orders, resources, pricing and delivery.", cat: "pro", icon: "languages", status: "soon" },

  // ── Real Estate (10) ───────────────────────────────────────────────────────
  { id: "property-management", ara: "نظام إدارة الأملاك", en: "Property Management System", descAr: "إدارة الوحدات والعقود والإيجارات والصيانة للأملاك.", descEn: "Units, contracts, rentals and maintenance for properties.", cat: "estate", icon: "building", status: "soon" },
  { id: "real-estate-crm", ara: "نظام CRM العقاري", en: "Real Estate CRM", descAr: "إدارة العملاء والفرص والصفقات العقارية في مكان واحد.", descEn: "Customers, opportunities and deals in one CRM.", cat: "estate", icon: "users", status: "soon" },
  { id: "property-rental", ara: "نظام تأجير العقارات", en: "Property Rental Management System", descAr: "إدارة الإيجار والعقود والدفعات والتفاويض للعقارات.", descEn: "Leases, contracts, payments and handovers.", cat: "estate", icon: "key", status: "soon" },
  { id: "property-sales", ara: "نظام بيع العقارات", en: "Property Sales Management System", descAr: "إدارة التسويق والبيع والتملك والعمولات للعقارات.", descEn: "Marketing, sales, ownership and commissions.", cat: "estate", icon: "trend", status: "soon" },
  { id: "tenant", ara: "نظام إدارة المستأجرين", en: "Tenant Management System", descAr: "إدارة المستأجرين والعقود والدفعات والتواصل.", descEn: "Tenants, contracts, payments and communication.", cat: "estate", icon: "people", status: "soon" },
  { id: "land", ara: "نظام إدارة الأراضي", en: "Land Management System", descAr: "إدارة الأراضي والمساحات والتصنيف والحدود.", descEn: "Lands, areas, zoning and boundaries.", cat: "estate", icon: "landplot", status: "soon" },
  { id: "property-maintenance", ara: "نظام صيانة العقارات", en: "Property Maintenance System", descAr: "إدارة طلبات الصيانة والفنيين وتكاليف العقارات.", descEn: "Maintenance requests, technicians and costs.", cat: "estate", icon: "wrench", status: "soon" },
  { id: "real-estate-accounting", ara: "نظام محاسبة العقارات", en: "Real Estate Accounting System", descAr: "المحاسبة للعقارات والإيجارات والفوترة والدفعات.", descEn: "Property accounting, rents, invoicing and payments.", cat: "estate", icon: "calc", status: "soon" },
  { id: "building-mgmt", ara: "نظام إدارة المباني", en: "Building Management System", descAr: "إدارة المرافق والأدوار والسكان للعقار الواحد.", descEn: "Facilities, floors and occupants for buildings.", cat: "estate", icon: "building2", status: "soon" },
  { id: "facility", ara: "نظام إدارة المرافق", en: "Facility Management System", descAr: "إدارة المرافق والصيانة والخدمات للمنشآت.", descEn: "Facilities, maintenance and services.", cat: "estate", icon: "settings", status: "soon" },

  // ── Logistics & Transportation (10) ────────────────────────────────────────
  { id: "logistics", ara: "نظام إدارة الخدمات اللوجستية", en: "Logistics Management System", descAr: "إدارة الشحن والفرز والتتبع للشحنات والعمليات.", descEn: "Shipping, sorting and tracking for operations.", cat: "logistics", icon: "truck", status: "soon" },
  { id: "delivery", ara: "نظام إدارة التوصيل", en: "Delivery Management System", descAr: "إدارة الطلبات والمندوبين والمناطق وجدولة التوصيل.", descEn: "Orders, riders, zones and delivery scheduling.", cat: "logistics", icon: "bike", status: "soon" },
  { id: "courier", ara: "نظام شركات التوصيل", en: "Courier Management System", descAr: "إدارة الشحنات والمركبات والتتبع لشركات الكيرير.", descEn: "Parcels, vehicles and tracking for couriers.", cat: "logistics", icon: "package", status: "soon" },
  { id: "fleet-logistics", ara: "نظام أسطول النقل", en: "Fleet Management System", descAr: "تتبع الأسطول والوقود والصيانة ومسارات الشحن.", descEn: "Fleet tracking, fuel, maintenance and routes.", cat: "logistics", icon: "truck", status: "soon" },
  { id: "warehouse", ara: "نظام المستودعات", en: "Warehouse Management System", descAr: "إدارة المواقع والحركة والجرد والمخزون للمستودعات.", descEn: "Locations, movements, stock-takes and inventory.", cat: "logistics", icon: "warehouse", status: "soon" },
  { id: "inventory", ara: "نظام إدارة المخزون", en: "Inventory Management System", descAr: "متابعة المخزون وإعادة الطلب والتقارير عبر الفروع.", descEn: "Stock tracking, reordering and reports across branches.", cat: "logistics", icon: "box", status: "soon" },
  { id: "shipping", ara: "نظام الشحن", en: "Shipping Management System", descAr: "إدارة الشحن الدولي والمستندات وشركات الشحن.", descEn: "Freight, documents and carriers management.", cat: "logistics", icon: "ship", status: "soon" },
  { id: "driver", ara: "نظام إدارة السائقين", en: "Driver Management System", descAr: "إدارة السائقين والرخص والمهام والمصاريف.", descEn: "Drivers, licenses, tasks and expenses.", cat: "logistics", icon: "steering", status: "soon" },
  { id: "transportation", ara: "نظام النقل", en: "Transportation Management System", descAr: "إدارة خطوط النقل والرحلات والتوقفات والحصيلة.", descEn: "Routes, trips, stops and collections for transport.", cat: "logistics", icon: "map", status: "soon" },
  { id: "dispatch", ara: "نظام الإرسالية", en: "Dispatch System", descAr: "توزيع الطلبات والمندوبين بسذكاء وتحكم مركزي.", descEn: "Smart order and rider allocation with central control.", cat: "logistics", icon: "navigation", status: "soon" },

  // ── Manufacturing (10) ─────────────────────────────────────────────────────
  { id: "mfg-erp", ara: "نظام التصنيع المركزي ERP", en: "Manufacturing ERP", descAr: "تخطيط موارد شامل للمصانع والعمليات والتمويل.", descEn: "End-to-end ERP for plants, operations and finance.", cat: "mfg", icon: "factory", status: "soon" },
  { id: "production", ara: "نظام الإنتاج", en: "Production Management System", descAr: "إدارة خطوط الإنتاج والأوامر والتحويل والطاقة.", descEn: "Lines, orders, conversion and capacity management.", cat: "mfg", icon: "cog", status: "soon" },
  { id: "factory", ara: "نظام المصانع", en: "Factory Management System", descAr: "إدارة العمليات والأقسام والموارد داخل المصنع.", descEn: "Operations, departments and resources in plants.", cat: "mfg", icon: "radar", status: "soon" },
  { id: "raw-materials", ara: "نظام المواد الخام", en: "Raw Materials Management System", descAr: "إدارة مدخلات الإنتاج والمخزون والموردين للمواد الخام.", descEn: "Inputs, stock and suppliers for raw materials.", cat: "mfg", icon: "box", status: "soon" },
  { id: "mfg-inventory", ara: "نظام مخزون التصنيع", en: "Manufacturing Inventory System", descAr: "جرد مواد التشغيل والمصنعية والمراحل للمصانع.", descEn: "WIP and finished goods tracking for plants.", cat: "mfg", icon: "boxes", status: "soon" },
  { id: "quality", ara: "نظام مراقبة الجودة", en: "Quality Control System", descAr: "إدارة فحص الجودة والعيوب والمواصفات والتقارير.", descEn: "Inspection, defects, specs and quality reports.", cat: "mfg", icon: "check", status: "soon" },
  { id: "production-planning", ara: "نظام تخطيط الإنتاج", en: "Production Planning System", descAr: "تخطيط الطاقة والمخزون والجدولة لأوامر الإنتاج.", descEn: "Capacity, materials and scheduling for production.", cat: "mfg", icon: "calendar", status: "soon" },
  { id: "machine-maintenance", ara: "نظام صيانة المعدات", en: "Machine Maintenance System", descAr: "إدارة صيانة الماكينات والأعطال وقطع الغيار.", descEn: "Machines, breakdowns and spare-parts maintenance.", cat: "mfg", icon: "wrench", status: "soon" },
  { id: "mfg-purchase", ara: "نظام مشتريات التصنيع", en: "Manufacturing Purchase System", descAr: "إدارة شراء المواد والتسعير والموردين للمصانع.", descEn: "Material buying, pricing and suppliers for plants.", cat: "mfg", icon: "truck", status: "soon" },
  { id: "supplier", ara: "نظام إدارة الموردين", en: "Supplier Management System", descAr: "إدارة الموردين والعقود والتقييمات والدفعات.", descEn: "Suppliers, contracts, ratings and payments.", cat: "mfg", icon: "handshake", status: "soon" },

  // ── Beauty & Personal Care (8) ─────────────────────────────────────────────
  { id: "salon", ara: "نظام الصالونات", en: "Salon Management System", descAr: "إدارة المواعيد والخدمات والفنيين والاشتراكات للصالون.", descEn: "Appointments, services, staff and memberships.", cat: "beauty", icon: "scissors", status: "soon" },
  { id: "barber", ara: "نظام حلاقة الرجال", en: "Barber Shop System", descAr: "إدارة الكراسي والمواعيد والخدمات لمحلات الحلاقة.", descEn: "Chairs, appointments and services for barbershops.", cat: "beauty", icon: "razor", status: "soon" },
  { id: "beauty-center", ara: "نظام مراكز التجميل", en: "Beauty Center System", descAr: "إدارة الباقات والخدمات والفنيين لمراكز التجميل.", descEn: "Packages, services and staff for beauty centers.", cat: "beauty", icon: "sparkles", status: "soon" },
  { id: "spa", ara: "نظام المنتجعات الصحية", en: "Spa Management System", descAr: "إدارة الجلسات والمواعيد والمنتجات للمنتجع الصحي.", descEn: "Treatments, appointments and products for spas.", cat: "beauty", icon: "leaf", status: "soon" },
  { id: "nail-salon", ara: "نظام أظافر", en: "Nail Salon System", descAr: "إدارة المواعيد وقوائم الخدمات والفنيين للأظافر.", descEn: "Bookings, service lists and techs for nail salons.", cat: "beauty", icon: "hand", status: "soon" },
  { id: "tattoo", ara: "نظام إستوديو التاتو", en: "Tattoo Studio Management System", descAr: "إدارة التصاميم والمواعيد والحجوزات للإستوديو.", descEn: "Designs, appointments and bookings for studios.", cat: "beauty", icon: "drawing", status: "soon" },
  { id: "beauty-appt", ara: "نظام حجوزات التجميل", en: "Beauty Appointment System", descAr: "إدارة الحجوزات والتذكيرات والإلغاءات لمراكز التجميل.", descEn: "Bookings, reminders and cancellations.", cat: "beauty", icon: "calendar", status: "soon" },
  { id: "membership", ara: "نظام العضويات", en: "Membership Management System", descAr: "إدارة الاشتراكات والاشتراكات والتجديد والخصومات.", descEn: "Subscriptions, renewals and discounts.", cat: "beauty", icon: "badge", status: "soon" },

  // ── Fitness & Sports (7) ───────────────────────────────────────────────────
  { id: "gym", ara: "نظام الجيم والأندية", en: "Gym Management System", descAr: "إدارة العضويات والمدفوعات والاشتراكات للجيم.", descEn: "Memberships, payments and check-ins for gyms.", cat: "fitness", icon: "dumbbell", status: "soon" },
  { id: "fitness-center", ara: "نظام مراكز اللياقة", en: "Fitness Center System", descAr: "إدارة المدربين والبرامج والاستهلاك لمراكز اللياقة.", descEn: "Trainers, programs and attendance for fitness.", cat: "fitness", icon: "heart", status: "soon" },
  { id: "personal-trainer", ara: "نظام المدرب الشخصي", en: "Personal Trainer Management System", descAr: "إدارة الجلسات والبرامج والعملاء للمدرب الشخصي.", descEn: "Sessions, programs and clients for PTs.", cat: "fitness", icon: "users", status: "soon" },
  { id: "sports-club", ara: "نظام الأندية الرياضية", en: "Sports Club Management System", descAr: "إدارة الفرق والمراحل والتسجيل والحصص للأندية.", descEn: "Teams, leagues, registration and fees.", cat: "fitness", icon: "trophy", status: "soon" },
  { id: "swimming-pool", ara: "نظام أحواض السباحة", en: "Swimming Pool Management System", descAr: "إدارة المواعيد والاشتراكات وحمامة السباحة.", descEn: "Schedules, subscriptions and pool sessions.", cat: "fitness", icon: "waves", status: "soon" },
  { id: "fitness-membership", ara: "نظام عضوية اللياقة", en: "Fitness Membership System", descAr: "إدارة الاشتراكات والتجديد والتحكم بالوصول.", descEn: "Plans, renewals and access control.", cat: "fitness", icon: "badge", status: "soon" },
  { id: "training-schedule", ara: "نظام جداول التدريب", en: "Training Schedule System", descAr: "إدارة جداول التدريب والحصص والفصول للمراكز.", descEn: "Scheduling and classes for training centers.", cat: "fitness", icon: "calendar", status: "soon" },

  // ── Service Businesses (9) ─────────────────────────────────────────────────
  { id: "cleaning", ara: "نظام شركات النظافة", en: "Cleaning Company System", descAr: "إدارة العقود والفريق والمهام والمواقع لشركة النظافة.", descEn: "Contracts, crew, tasks and sites for cleaners.", cat: "service", icon: "sparkles", status: "soon" },
  { id: "maintenance-co", ara: "نظام شركات الصيانة", en: "Maintenance Company System", descAr: "إدارة أوامر العمل والفنيين والعقود للصيانة.", descEn: "Work orders, technicians and contracts.", cat: "service", icon: "wrench", status: "soon" },
  { id: "plumbing", ara: "نظام السباكة", en: "Plumbing Company System", descAr: "إدارة الطلبات والفنيين والفوترة لشركات السباكة.", descEn: "Jobs, plumbers and billing for plumbing firms.", cat: "service", icon: "droplets", status: "soon" },
  { id: "electrical", ara: "نظام الكهرباء", en: "Electrical Company System", descAr: "إدارة المشاريع والجداول والفنيين للكهرباء.", descEn: "Projects, schedules and electricians.", cat: "service", icon: "plug", status: "soon" },
  { id: "ac-hvac", ara: "نظام التكييف", en: "AC / HVAC Company System", descAr: "إدارة التركيب والصيانة والعقود للتكييف والتبريد.", descEn: "Installation, servicing and contracts for HVAC.", cat: "service", icon: "fan", status: "soon" },
  { id: "pest-control", ara: "نظام مكافحة الحشرات", en: "Pest Control System", descAr: "إدارة الجولات والعقود والإبادة لمكافحة الآفات.", descEn: "Routes, contracts and treatments for pest control.", cat: "service", icon: "bug", status: "soon" },
  { id: "security", ara: "نظام شركات الأمن", en: "Security Company System", descAr: "إدارة الحراس والمواقع والورديات والمصاريف.", descEn: "Guards, sites, shifts and expenses.", cat: "service", icon: "shield", status: "soon" },
  { id: "landscaping", ara: "نظام تنسيق الحدائق", en: "Landscaping System", descAr: "إدارة المشاريع والتصاميم والمعدات لتنسيق الحدائق.", descEn: "Projects, designs and equipment for landscaping.", cat: "service", icon: "flower", status: "soon" },
  { id: "home-services", ara: "نظام الخدمات المنزلية", en: "Home Services Management System", descAr: "إدارة الطلبات والفنيين والتقييم محل منزل.", descEn: "Jobs, technicians and reviews for home services.", cat: "service", icon: "home", status: "soon" },

  // ── E-Commerce (10) ────────────────────────────────────────────────────────
  { id: "ecommerce", ara: "نظام التجارة الإلكترونية", en: "E-Commerce Management System", descAr: "إدارة متجرك أونلاين بالمنتجات والطلبات والدفع.", descEn: "Storefront, catalog, orders and payments online.", cat: "ecom", icon: "cart", status: "soon" },
  { id: "marketplace", ara: "نظام الأسواق متعددة البائعين", en: "Multi-Vendor Marketplace System", descAr: "منصة بائعين متعددين مع العمولات والمراجعات.", descEn: "Multi-seller platform with commissions and reviews.", cat: "ecom", icon: "globe", status: "soon" },
  { id: "order", ara: "نظام إدارة الطلبات", en: "Order Management System", descAr: "إدارة الطلبات من السلة حتى التسليم والمرتجعات.", descEn: "Manage orders from basket to delivery and returns.", cat: "ecom", icon: "clipboard", status: "soon" },
  { id: "product", ara: "نظام إدارة المنتجات", en: "Product Management System", descAr: "إدارة المنتجات والأصناف والصور والأسعار للمتجر.", descEn: "Products, categories, media and pricing.", cat: "ecom", icon: "package", status: "soon" },
  { id: "customer", ara: "نظام إدارة العملاء", en: "Customer Management System", descAr: "إدارة العملاء والتاريخ والبرامج الولائية للمتجر.", descEn: "Customers, history and loyalty programs.", cat: "ecom", icon: "users", status: "soon" },
  { id: "seller", ara: "نظام إدارة البائعين", en: "Seller Management System", descAr: "إدارة البائعين والمنتجات والعمولات في السوق.", descEn: "Sellers, listings and commissions in marketplaces.", cat: "ecom", icon: "store", status: "soon" },
  { id: "ecom-delivery", ara: "نظام توصيل المتاجر", en: "E-Commerce Delivery System", descAr: "إدارة شحنات وتسليمات المتاجر مع تتبع للمشتري.", descEn: "Shipments and deliveries with buyer tracking.", cat: "ecom", icon: "bike", status: "soon" },
  { id: "coupon", ara: "نظام الكوبونات والخصومات", en: "Coupon & Discount System", descAr: "إدارة الكوبونات والخصومات والترويج للعروض.", descEn: "Coupons, discounts and promotional offers.", cat: "ecom", icon: "ticket", status: "soon" },
  { id: "returns", ara: "نظام المرتجعات", en: "Returns Management System", descAr: "إدارة المرتجعات والاسترجاع والتسويات للمتجر.", descEn: "Returns, refunds and reconciliations.", cat: "ecom", icon: "rotate", status: "soon" },
  { id: "subscription", ara: "نظام الاشتراكات", en: "Subscription Commerce System", descAr: "منتجات وخطط اشتراك وتجديد دوري ودفع مستمر.", descEn: "Subscriptions, billing cycles and recurring payments.", cat: "ecom", icon: "repeat", status: "soon" },

  // ── Websites & Online Stores (12) ──────────────────────────────────────────
  { id: "website-builder", ara: "نظام بناء المواقع", en: "Website Builder System", descAr: "بناء مواقع تجارية سريعة بالقوالب والاستضافة وبدون برمجة.", descEn: "Fast business sites with templates, hosting and no code.", cat: "web", icon: "layout", status: "soon" },
  { id: "corporate-website", ara: "نظام الموقع المؤسسي", en: "Corporate Website System", descAr: "إدارة المحتوى والأقسام والأخبار لموقع الشركة التعريفي.", descEn: "Content, sections and news for a corporate site.", cat: "web", icon: "briefcase", status: "soon" },
  { id: "landing-pages", ara: "نظام الصفحات التعريفية", en: "Landing Pages System", descAr: "إنشاء صفحات إعلانية وتحويلية مع الربط والتتبع والتحويلات.", descEn: "Ad and conversion landing pages with tracking.", cat: "web", icon: "monitor", status: "soon" },
  { id: "blog-cms", ara: "نظام التدوينات", en: "Blog & Content System", descAr: "نشر المقالات والأقسام والوسوم وتحليلات القراءة.", descEn: "Articles, categories, tags and read analytics.", cat: "web", icon: "book", status: "soon" },
  { id: "online-store-website", ara: "نظام متجر أونلاين كامل", en: "Full Online Store Website", descAr: "متجر إلكتروني متكامل بالمنتجات والدفع والتوصيل والإحصائيات.", descEn: "End-to-end online store with payments and delivery.", cat: "web", icon: "cart", status: "soon" },
  { id: "booking-website", ara: "نظام موقع الحجوزات", en: "Booking Website System", descAr: "حجوزات أونلاين للمواعيد والجلسات والغرف مع تقويم مباشر.", descEn: "Online bookings with a live calendar for any business.", cat: "web", icon: "calendar", status: "soon" },
  { id: "restaurant-website", ara: "نظام موقع المطعم", en: "Restaurant Website System", descAr: "موقع مع قائمة طعام وطلب أونلاين وحجوزات طاولات.", descEn: "Site with menu, online ordering and table bookings.", cat: "web", icon: "utensils", status: "soon" },
  { id: "portfolio-website", ara: "نظام موقع الأعمال", en: "Portfolio Website System", descAr: "موقع شخصي لعرض الأعمال والمشاريع والخدمات والسيرة.", descEn: "Personal portfolio for work, projects and services.", cat: "web", icon: "palette", status: "soon" },
  { id: "membership-website", ara: "نظام مواقع العضويات", en: "Membership Website System", descAr: "محتوى خاص باشتراكات وصلاحيات ومدفوعات متكررة.", descEn: "Gated content with subscriptions and recurring billing.", cat: "web", icon: "badge", status: "soon" },
  { id: "event-website", ara: "نظام موقع الفعاليات", en: "Event Website System", descAr: "موقع للأحداث والتسجيل والتذاكر والجدول الزمني.", descEn: "Event site with registration, tickets and schedule.", cat: "web", icon: "ticket", status: "soon" },
  { id: "multilingual-website", ara: "نظام المواقع متعددة اللغات", en: "Multilingual Website System", descAr: "محتوى متعدد اللغات مع ترجمات ومفتاح لغة تلقائي.", descEn: "Multi-language content with translations and auto-switch.", cat: "web", icon: "globe", status: "soon" },
  { id: "ecommerce-seller", ara: "نظام منصات البائعين", en: "Vendor Portal Website", descAr: "بوابة للموردين والبائعين لإدارة المنتجات والطلبات أونلاين.", descEn: "Portal for vendors to manage products and orders.", cat: "web", icon: "store", status: "soon" },

  // ── Agriculture (9) ────────────────────────────────────────────────────────
  { id: "farm", ara: "نظام إدارة المزارع", en: "Farm Management System", descAr: "إدارة المزارع والمحاصيل والمواسم والقوى العاملة.", descEn: "Farms, crops, seasons and labor.", cat: "agri", icon: "wheat", status: "soon" },
  { id: "agri-inventory", ara: "نظام مخزون المزرعة", en: "Agricultural Inventory System", descAr: "إدارة مستلزمات المزرعة والمخزون والاستهلاك.", descEn: "Farm supplies, stock and consumption.", cat: "agri", icon: "box", status: "soon" },
  { id: "livestock", ara: "نظام الثروة الحيوانية", en: "Livestock Management System", descAr: "إدارة الحيوانات والقطعان والتطعيمات والإنتاج.", descEn: "Animals, herds, vaccinations and production.", cat: "agri", icon: "cow", status: "soon" },
  { id: "poultry", ara: "نظام مزارع الدواجن", en: "Poultry Farm System", descAr: "إدارة الدواجن والدورات والعلف والمبيعات.", descEn: "Birds, cycles, feed and sales for poultry.", cat: "agri", icon: "bird", status: "soon" },
  { id: "dairy", ara: "نظام مزارع الألبان", en: "Dairy Farm System", descAr: "إدارة الأبقار والحلب والإنتاج والجودة.", descEn: "Cows, milking, production and quality.", cat: "agri", icon: "milk", status: "soon" },
  { id: "irrigation", ara: "نظام الري", en: "Irrigation Management System", descAr: "إدارة خطوط الري والجداول والاستهلاك المائي.", descEn: "Irrigation lines, schedules and water usage.", cat: "agri", icon: "droplets", status: "soon" },
  { id: "crop", ara: "نظام إدارة المحاصيل", en: "Crop Management System", descAr: "تخطيط المحاصيل والزراعة والتسميد والجني.", descEn: "Crop planning, planting, fertilizing and harvest.", cat: "agri", icon: "sprout", status: "soon" },
  { id: "agri-sales", ara: "نظام مبيعات المزرعة", en: "Agricultural Sales System", descAr: "بيع المنتجات الزراعية والمقايضة والمشترين.", descEn: "Farm sales, trade and buyers.", cat: "agri", icon: "cart", status: "soon" },
  { id: "agri-equipment", ara: "نظام معدات المزرعة", en: "Agricultural Equipment System", descAr: "إدارة الآليات والصيانة والتأجير للزراعة.", descEn: "Machinery, maintenance and rentals for farms.", cat: "agri", icon: "tractor", status: "soon" },

  // ── Enterprise (11) ────────────────────────────────────────────────────────
  { id: "erp", ara: "نظام ERP", en: "ERP System", descAr: "نظام شامل للموارد: مبيعات ومخزون ومحاسبة وشؤون موظفين.", descEn: "Full resource planning: sales, stock, finance, HR.", cat: "enterprise", icon: "landmark", status: "soon" },
  { id: "crm", ara: "نظام CRM", en: "CRM System", descAr: "إدارة العمليات البيعية والعملاء والفرص والأنشطة.", descEn: "Sales pipeline, customers, opportunities and tasks.", cat: "enterprise", icon: "megaphone", status: "soon" },
  { id: "hr", ara: "نظام الموارد البشرية", en: "HR Management System", descAr: "إدارة الموظفين والرواتب والإجازات والاستقطاعات.", descEn: "Employees, payroll, leaves and deductions.", cat: "enterprise", icon: "users", status: "soon" },
  { id: "employee", ara: "نظام إدارة الموظفين", en: "Employee Management System", descAr: "ملفات الموظفين والادوار والصلاحيات والمهام.", descEn: "Records, roles, permissions and tasks.", cat: "enterprise", icon: "usercog", status: "soon" },
  { id: "attendance", ara: "نظام الحضور والانصراف", en: "Attendance Management System", descAr: "تسجيل الحضور والانصراف والشاشة والتقارير.", descEn: "Clock-in/out, shifts and attendance reports.", cat: "enterprise", icon: "clock", status: "soon" },
  { id: "leave", ara: "نظام الإجازات", en: "Leave Management System", descAr: "إدارة طلبات الإجازات والموافقات والأرصدة.", descEn: "Leave requests, approvals and balances.", cat: "enterprise", icon: "calendar", status: "soon" },
  { id: "procurement-mgmt", ara: "نظام المشتريات", en: "Procurement Management System", descAr: "إدارة الطلبات والعطاءات والعقود والموردين.", descEn: "Requests, bids, contracts and suppliers.", cat: "enterprise", icon: "briefcase", status: "soon" },
  { id: "asset", ara: "نظام الأصول", en: "Asset Management System", descAr: "تتبع الأصول والإهلاك والصيانة والمواقع.", descEn: "Track assets, depreciation, maintenance and sites.", cat: "enterprise", icon: "box", status: "soon" },
  { id: "documents", ara: "نظام إدارة المستندات", en: "Document Management System", descAr: "أرشفة المستندات والفهرسة والنسخ والتصاريح.", descEn: "Archiving, indexing, versions and permissions.", cat: "enterprise", icon: "filetext", status: "soon" },
  { id: "workflow", ara: "نظام سير العمل", en: "Workflow Management System", descAr: "أتمتة العمليات والموافقات والمهام المؤسسية.", descEn: "Automate processes, approvals and tasks.", cat: "enterprise", icon: "workflow", status: "soon" },
  { id: "help-desk", ara: "نظام الدعم الفني الداخلي", en: "Internal Help Desk System", descAr: "إدارة التذاكر والطلبات الداخلية وقنوات الدعم.", descEn: "Tickets, internal requests and support channels.", cat: "enterprise", icon: "headphones", status: "soon" },
];

export const SYSTEMS: BusinessSystem[] = S.map((s) => ({
  id: s.id,
  nameAr: s.ara,
  nameEn: s.en,
  descAr: s.descAr,
  descEn: s.descEn,
  category: s.cat,
  icon: s.icon,
  status: s.status ?? "soon",
  href: s.live ? liveHref(s.live) : undefined,
}));

export const CATEGORY_MAP: Record<string, SystemCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

/** Look up a catalog system by its stable id (used by sign-in / org flows). */
export function getSystemById(id: string | undefined | null): BusinessSystem | undefined {
  if (!id) return undefined;
  return SYSTEMS.find((s) => s.id === id);
}