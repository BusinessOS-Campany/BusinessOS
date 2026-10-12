import {
  Accessibility,
  Activity,
  Archive,
  Backpack,
  BadgeCheck,
  Banknote,
  BedDouble,
  Bike,
  Bird,
  BookMarked,
  BookOpen,
  Boxes,
  Braces,
  Briefcase,
  Brush,
  Building,
  Building2,
  Bus,
  Calculator,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Car,
  CarFront,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Cog,
  Coffee,
  Coins,
  Compass,
  Contact,
  Container,
  CookingPot,
  Cpu,
  CreditCard,
  Croissant,
  Cross,
  CupSoda,
  Dumbbell,
  Droplet,
  Droplets,
  Eye,
  Factory,
  FileText,
  Fingerprint,
  Flag,
  FlaskConical,
  Flower2,
  FolderOpen,
  Forklift,
  Gauge,
  Gavel,
  Gem,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  Handshake,
  HardHat,
  Headphones,
  HeartHandshake,
  HeartPulse,
  Hospital,
  Hotel,
  KeyRound,
  Landmark,
  Languages,
  Laptop,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Leaf,
  Library,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  MapPin,
  Medal,
  Megaphone,
  Microscope,
  Milk,
  Monitor,
  Mountain,
  Navigation,
  Network,
  Package,
  PackageCheck,
  Paintbrush,
  PawPrint,
  PenTool,
  Percent,
  PiggyBank,
  Pill,
  Presentation,
  Radio,
  Receipt,
  Repeat,
  RotateCcw,
  Route,
  Ruler,
  Sandwich,
  Scale,
  ScanBarcode,
  School,
  Scissors,
  Send,
  Settings,
  Shapes,
  ShieldCheck,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  SmilePlus,
  Sofa,
  Sparkles,
  SprayCan,
  Sprout,
  Stethoscope,
  Store,
  Tag,
  Ticket,
  Timer,
  Tractor,
  TreePine,
  TrendingUp,
  Trophy,
  Truck,
  Tv,
  Umbrella,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  UtensilsCrossed,
  Warehouse,
  Wallet,
  Waves,
  Wheat,
  Wind,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { liveHref } from "./systems-catalog";

/**
 * Business systems catalog — structured data behind the /demo solutions grid.
 *
 * Pure data (no JSX): categories + 173 systems with Arabic/English names,
 * short descriptions, search keywords, a lucide icon, and availability.
 * Cards render dynamically from this registry — never 173 components.
 */

export type SystemStatus = "available" | "coming_soon";

export interface SystemCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  icon: LucideIcon;
}

export interface BusinessSystem {
  id: string;
  category: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  keywords: string;
  icon: LucideIcon;
  status: SystemStatus;
  /** Live route for available systems (same-origin proxy). Undefined = coming soon. */
  route?: string;
}

export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  { id: "healthcare", nameAr: "الرعاية الصحية", nameEn: "Healthcare", descAr: "أنظمة العيادات والمستشفيات والصيدليات والمختبرات", descEn: "Clinics, hospitals, pharmacies and labs", icon: Stethoscope },
  { id: "retail", nameAr: "التجزئة والمتاجر", nameEn: "Retail & Shops", descAr: "نقاط البيع وإدارة المتاجر والمخزون", descEn: "POS and store management", icon: ShoppingBag },
  { id: "food", nameAr: "المطاعم والأغذية", nameEn: "Restaurants & Food", descAr: "إدارة المطاعم والمقاهي والمطابخ والتوصيل", descEn: "Restaurants, cafés, kitchens and delivery", icon: UtensilsCrossed },
  { id: "hospitality", nameAr: "الضيافة والفنادق", nameEn: "Hospitality", descAr: "الفنادق والشقق والحجوزات وخدمة الغرف", descEn: "Hotels, rentals, bookings and housekeeping", icon: Hotel },
  { id: "finance", nameAr: "المالية والمحاسبة", nameEn: "Finance & Accounting", descAr: "المحاسبة والرواتب والفواتير والتدفق النقدي", descEn: "Accounting, payroll, invoicing and cash flow", icon: Calculator },
  { id: "construction", nameAr: "المقاولات والإنشاءات", nameEn: "Construction", descAr: "المشاريع والمقاولين والمواقع والمعدات", descEn: "Projects, contractors, sites and equipment", icon: HardHat },
  { id: "automotive", nameAr: "السيارات", nameEn: "Automotive", descAr: "المعارض والتأجير والورش وقطع الغيار", descEn: "Dealerships, rentals, garages and parts", icon: Car },
  { id: "education", nameAr: "التعليم", nameEn: "Education", descAr: "المدارس والمعاهد والطلاب والاختبارات", descEn: "Schools, institutes, students and exams", icon: GraduationCap },
  { id: "professional", nameAr: "الخدمات المهنية", nameEn: "Professional Services", descAr: "مكاتب المحاماة والاستشارات والوكالات", descEn: "Law, consulting, agencies and firms", icon: Briefcase },
  { id: "realestate", nameAr: "العقارات", nameEn: "Real Estate", descAr: "إدارة العقارات والتأجير والمستأجرين والصيانة", descEn: "Property, rentals, tenants and maintenance", icon: Building2 },
  { id: "logistics", nameAr: "اللوجستيات والنقل", nameEn: "Logistics & Transportation", descAr: "التوصيل والمستودعات والأساطيل والشحن", descEn: "Delivery, warehouses, fleets and shipping", icon: Truck },
  { id: "manufacturing", nameAr: "التصنيع", nameEn: "Manufacturing", descAr: "الإنتاج والمصانع والجودة والموردين", descEn: "Production, factories, quality and suppliers", icon: Factory },
  { id: "beauty", nameAr: "الجمال والعناية", nameEn: "Beauty & Personal Care", descAr: "الصالونات والسبا والحجوزات والعضويات", descEn: "Salons, spas, bookings and memberships", icon: Scissors },
  { id: "fitness", nameAr: "اللياقة والرياضة", nameEn: "Fitness & Sports", descAr: "الأندية والمدربين والاشتراكات والجداول", descEn: "Gyms, trainers, memberships and schedules", icon: Dumbbell },
  { id: "services", nameAr: "شركات الخدمات", nameEn: "Service Businesses", descAr: "التنظيف والصيانة والخدمات المنزلية", descEn: "Cleaning, maintenance and home services", icon: Wrench },
  { id: "ecommerce", nameAr: "التجارة الإلكترونية", nameEn: "E-Commerce", descAr: "المتاجر والطلبات والبائعين والكوبونات", descEn: "Stores, orders, sellers and coupons", icon: Globe },
  { id: "agriculture", nameAr: "الزراعة", nameEn: "Agriculture", descAr: "المزارع والمحاصيل والثروة الحيوانية", descEn: "Farms, crops and livestock", icon: Wheat },
  { id: "enterprise", nameAr: "أنظمة المؤسسات", nameEn: "Enterprise", descAr: "تخطيط الموارد والموارد البشرية والعمليات", descEn: "ERP, HR, documents and workflows", icon: Layers },
];

const SOON: Pick<BusinessSystem, "status"> = { status: "coming_soon" };

/**
 * Live systems, addressed by registry slug rather than by path.
 *
 * The path comes from the demo registry so an entry here cannot point at a mount
 * the platform stopped serving - which is what happened to the literal
 * `"/grocery"` when that app moved into the `/demo` namespace.
 */
const LIVE = (slug: string): Pick<BusinessSystem, "status" | "route"> => ({
  status: "available",
  route: liveHref(slug) ?? `/${slug}`,
});

export const BUSINESS_SYSTEMS: readonly BusinessSystem[] = [
  // ── Healthcare (10) ──────────────────────────────────────────
  { id: "clinic", category: "healthcare", nameAr: "نظام إدارة العيادات", nameEn: "Clinic Management System", descAr: "حل متكامل لإدارة العيادات الحديثة والمواعيد والملفات الطبية.", descEn: "Complete solution for modern clinics, appointments and records.", keywords: "clinic medical عيادة طبي", icon: HeartPulse, ...SOON },
  { id: "dental", category: "healthcare", nameAr: "نظام عيادة الأسنان", nameEn: "Dental Clinic System", descAr: "إدارة المرضى والمواعيد والحشوات والتركيبات والفواتير والمختبر لعيادتك.", descEn: "Patients, appointments, prosthetics, billing and lab.", keywords: "dental teeth أسنان عيادة", icon: SmilePlus, ...LIVE("dental") },
  { id: "hospital", category: "healthcare", nameAr: "نظام إدارة المستشفيات", nameEn: "Hospital Management System", descAr: "إدارة المرضى والمواعيد والأسرّة والفواتير والأقسام الطبية.", descEn: "Patients, beds, departments, billing and emergency.", keywords: "hospital مستشفى", icon: Cross, ...SOON },
  { id: "pharmacy", category: "healthcare", nameAr: "نظام إدارة الصيدليات", nameEn: "Pharmacy Management System", descAr: "إدارة الأدوية والمخزون والمنتجات والوصفات الطبية والفواتير لصيدليتك.", descEn: "Medicines, stock, prescriptions, sales and expiry.", keywords: "pharmacy medicine صيدلية دواء", icon: Pill, ...LIVE("pharmacy") },
  { id: "laboratory", category: "healthcare", nameAr: "نظام المختبرات", nameEn: "Laboratory Management System", descAr: "إدارة الفحوصات والعينات والنتائج والأقسام والفواتير لمختبرك الطبي.", descEn: "Tests, samples, results, departments and billing.", keywords: "lab laboratory مختبر فحوصات تحاليل", icon: Microscope, ...SOON },
  { id: "medical-center", category: "healthcare", nameAr: "نظام المركز الطبي", nameEn: "Medical Center System", descAr: "إدارة المرضى والجلسات والمواعيد والمدفوعات لمركزك الصحي.", descEn: "Multi-specialty patient, session and payment management.", keywords: "medical center مركز طبي علاج", icon: Hospital, ...SOON },
  { id: "physiotherapy", category: "healthcare", nameAr: "نظام مركز العلاج الطبيعي", nameEn: "Physiotherapy Center System", descAr: "خطط العلاج والجلسات وتقييمات التقدم والمواعيد.", descEn: "Treatment plans, sessions, progress tracking and bookings.", keywords: "physio therapy علاج طبيعي", icon: Accessibility, ...SOON },
  { id: "veterinary", category: "healthcare", nameAr: "نظام العيادة البيطرية", nameEn: "Veterinary Clinic System", descAr: "ملفات الحيوانات والتطعيمات والعمليات والمواعيد.", descEn: "Animal records, vaccinations, surgeries and visits.", keywords: "vet veterinary بيطري حيوانات", icon: PawPrint, ...SOON },
  { id: "optometry", category: "healthcare", nameAr: "نظام عيادة العيون", nameEn: "Optometry / Eye Clinic System", descAr: "إدارة المرضى والمواعيد والفحوصات البصرية ووصفات النظارات والعدسات والفواتير لعيادتك.", descEn: "Eye exams, glasses and lens prescriptions, billing.", keywords: "eye optometry عيون نظارات", icon: Eye, ...SOON },
  { id: "diagnostic", category: "healthcare", nameAr: "نظام مركز التشخيص", nameEn: "Diagnostic Center System", descAr: "الأشعة والتصوير والتقارير التشخيصية والأرشفة.", descEn: "Radiology, imaging, diagnostic reports and archiving.", keywords: "diagnostic radiology أشعة تشخيص", icon: FlaskConical, ...SOON },

  // ── Retail & Shops (12) ──────────────────────────────────────
  { id: "pos", category: "retail", nameAr: "نظام نقاط البيع", nameEn: "POS System", descAr: "نقاط بيع سريعة مع باركود، وإدارة المنتجات والمخازن والمبيعات والعملاء والموردين والصندوق.", descEn: "Fast barcode sales with stock, customers and cash.", keywords: "pos point sale نقاط بيع كاشير", icon: ScanBarcode, ...SOON },
  { id: "supermarket", category: "retail", nameAr: "نظام إدارة السوبرماركت", nameEn: "Supermarket Management System", descAr: "الفروع والأقسام والعروض والموردون والجرد.", descEn: "Branches, departments, promotions, suppliers and stocktake.", keywords: "supermarket market سوبرماركت", icon: ShoppingCart, ...SOON },
  { id: "grocery", category: "retail", nameAr: "نظام البقالة", nameEn: "Grocery Store System", descAr: "منتجات وباركود وموردين وعملاء وتقارير ربح لبقالتك.", descEn: "Products, barcodes, suppliers, customers and profit reports.", keywords: "grocery بقالة تموينات", icon: Store, ...LIVE("grocery") },
  { id: "clothing", category: "retail", nameAr: "نظام متجر الملابس", nameEn: "Clothing Store System", descAr: "المقاسات والألوان والمواسم والمرتجعات والولاء.", descEn: "Sizes, colors, seasons, returns and loyalty.", keywords: "clothes fashion ملابس أزياء", icon: Shirt, ...SOON },
  { id: "electronics", category: "retail", nameAr: "نظام متجر الإلكترونيات", nameEn: "Electronics Store System", descAr: "الأجهزة والضمانات والأرقام التسلسلية والخدمة.", descEn: "Devices, warranties, serial numbers and service.", keywords: "electronics أجهزة إلكترونيات", icon: Tv, ...SOON },
  { id: "mobile-shop", category: "retail", nameAr: "نظام محل الجوالات", nameEn: "Mobile Phone Shop System", descAr: "الأجهزة والشرائح والصيانة والأقساط والضمان.", descEn: "Devices, SIMs, repairs, installments and warranty.", keywords: "mobile phone جوالات هواتف", icon: Smartphone, ...SOON },
  { id: "furniture", category: "retail", nameAr: "نظام متجر الأثاث", nameEn: "Furniture Store System", descAr: "المعرض والطلبات الخاصة والتوصيل والتركيب.", descEn: "Showroom, custom orders, delivery and assembly.", keywords: "furniture أثاث مفروشات", icon: Sofa, ...SOON },
  { id: "jewelry", category: "retail", nameAr: "نظام متجر المجوهرات", nameEn: "Jewelry Store System", descAr: "الذهب والأوزان والعيارات والشهادات والخزينة.", descEn: "Gold, weights, karats, certificates and vault.", keywords: "jewelry gold ذهب مجوهرات", icon: Gem, ...SOON },
  { id: "cosmetics", category: "retail", nameAr: "نظام متجر التجميل", nameEn: "Cosmetics Store System", descAr: "العلامات والدرجات والعروض وبرامج الولاء.", descEn: "Brands, shades, promotions and loyalty programs.", keywords: "cosmetics beauty تجميل مكياج عطور", icon: Sparkles, ...SOON },
  { id: "bookstore", category: "retail", nameAr: "نظام المكتبة", nameEn: "Bookstore System", descAr: "الكتب والناشرون والتصنيفات والطلبات المدرسية.", descEn: "Books, publishers, categories and school orders.", keywords: "books bookstore مكتبة كتب قرطاسية", icon: BookOpen, ...SOON },
  { id: "hardware", category: "retail", nameAr: "نظام متجر مواد البناء", nameEn: "Hardware Store System", descAr: "العدد والأدوات والبيع بالجملة والتوصيل للمواقع.", descEn: "Tools, wholesale, site delivery and contractors.", keywords: "hardware tools عدد أدوات سباكة كهرباء", icon: Hammer, ...SOON },
  { id: "car-parts", category: "retail", nameAr: "نظام متجر قطع الغيار", nameEn: "Car Parts Store System", descAr: "البحث برقم القطعة والموديلات والمخزون والطلب.", descEn: "Part-number lookup, fitment, stock and ordering.", keywords: "parts spare قطع غيار سيارات", icon: Cog, ...SOON },

  // ── Restaurants & Food (10) ──────────────────────────────────
  { id: "restaurant", category: "food", nameAr: "نظام إدارة المطاعم", nameEn: "Restaurant Management System", descAr: "القوائم والطاولات والمطبخ والموظفون والتقارير.", descEn: "Menus, tables, kitchen, staff and reports.", keywords: "restaurant مطعم", icon: ChefHat, ...SOON },
  { id: "cafe", category: "food", nameAr: "نظام إدارة المقاهي", nameEn: "Café Management System", descAr: "إدارة المقهى الإلكتروني — أجهزة وجلسات وشحن ورواتب وتقارير يومية.", descEn: "Stations, sessions, top-ups, payroll and daily reports.", keywords: "cafe مقهى كافيه", icon: Coffee, ...SOON },
  { id: "fast-food", category: "food", nameAr: "نظام الوجبات السريعة", nameEn: "Fast Food Management System", descAr: "الطلبات السريعة والكومبو والتوصيل وشاشات المطبخ.", descEn: "Quick orders, combos, delivery and kitchen displays.", keywords: "fast food وجبات سريعة برجر", icon: Sandwich, ...SOON },
  { id: "bakery", category: "food", nameAr: "نظام المخابز", nameEn: "Bakery Management System", descAr: "الإنتاج اليومي والطلبات المسبقة والتوزيع والنقاط.", descEn: "Daily production, pre-orders, distribution and outlets.", keywords: "bakery مخبز حلويات معجنات", icon: Croissant, ...SOON },
  { id: "coffee-shop", category: "food", nameAr: "نظام محلات القهوة", nameEn: "Coffee Shop System", descAr: "المشروبات والحبوب والولاء والطلبات الخارجية.", descEn: "Beverages, beans, loyalty and takeaway orders.", keywords: "coffee قهوة بن", icon: CupSoda, ...SOON },
  { id: "cloud-kitchen", category: "food", nameAr: "نظام المطابخ السحابية", nameEn: "Cloud Kitchen System", descAr: "علامات متعددة وتكامل المنصات وإدارة السائقين.", descEn: "Multi-brand, aggregator integrations and riders.", keywords: "cloud kitchen مطبخ سحابي", icon: CookingPot, ...SOON },
  { id: "catering", category: "food", nameAr: "نظام التموين والحفلات", nameEn: "Catering Management System", descAr: "الفعاليات والقوائم المخصصة والضيافة والفواتير.", descEn: "Events, custom menus, staffing and invoicing.", keywords: "catering تموين حفلات مناسبات", icon: Utensils, ...SOON },
  { id: "food-delivery", category: "food", nameAr: "نظام إدارة التوصيل", nameEn: "Food Delivery Management System", descAr: "الطلبات والمناطق والسائقون والتتبع والتحصيل.", descEn: "Orders, zones, drivers, tracking and collection.", keywords: "delivery توصيل دليفري", icon: Bike, ...SOON },
  { id: "restaurant-pos", category: "food", nameAr: "نظام كاشير المطاعم", nameEn: "Restaurant POS System", descAr: "كاشير الطاولات والصالات والسفري مع الفصل.", descEn: "Dine-in and takeaway POS with split bills.", keywords: "pos كاشير مطعم", icon: Receipt, ...SOON },
  { id: "reservation", category: "food", nameAr: "نظام حجز الطاولات", nameEn: "Table Reservation System", descAr: "الحجوزات وقوائم الانتظار والتذكيرات والتقييم.", descEn: "Reservations, waitlists, reminders and reviews.", keywords: "reservation booking حجز طاولات", icon: CalendarCheck, ...SOON },

  // ── Hospitality (8) ──────────────────────────────────────────
  { id: "hotel", category: "hospitality", nameAr: "نظام إدارة الفنادق", nameEn: "Hotel Management System", descAr: "الحجوزات والغرف والنزلاء والفواتير والخدمات.", descEn: "Reservations, rooms, guests, billing and services.", keywords: "hotel فندق", icon: BedDouble, ...SOON },
  { id: "motel", category: "hospitality", nameAr: "نظام إدارة الموتيلات", nameEn: "Motel Management System", descAr: "إشغال سريع وتسجيل دخول وخروج وفوترة مبسطة.", descEn: "Quick occupancy, check-in/out and simple billing.", keywords: "motel موتيل", icon: KeyRound, ...SOON },
  { id: "resort", category: "hospitality", nameAr: "نظام إدارة المنتجعات", nameEn: "Resort Management System", descAr: "الشاليهات والمرافق والأنشطة والباقات الموسمية.", descEn: "Chalets, facilities, activities and seasonal packages.", keywords: "resort منتجع شاليه", icon: Waves, ...SOON },
  { id: "apartment-rental", category: "hospitality", nameAr: "نظام تأجير الشقق", nameEn: "Apartment Rental System", descAr: "الوحدات والعقود والتحصيل والصيانة والمستأجرون.", descEn: "Units, contracts, collection, maintenance and tenants.", keywords: "apartment rental شقق تأجير", icon: Building, ...SOON },
  { id: "guest-house", category: "hospitality", nameAr: "نظام بيوت الضيافة", nameEn: "Guest House Management System", descAr: "الحجوزات والغرف وخدمة الضيوف والمدفوعات.", descEn: "Bookings, rooms, guest service and payments.", keywords: "guest house دار ضيافة", icon: Monitor, ...SOON },
  { id: "hostel", category: "hospitality", nameAr: "نظام بيوت الشباب", nameEn: "Hostel Management System", descAr: "الأسرّة المشتركة والمجموعات والأنشطة والفواتير.", descEn: "Dorms, groups, activities and billing.", keywords: "hostel بيت شباب نزل", icon: Users, ...SOON },
  { id: "booking", category: "hospitality", nameAr: "نظام إدارة الحجوزات", nameEn: "Booking Management System", descAr: "محرك حجوزات متعدد القنوات مع التقويم والأسعار.", descEn: "Multi-channel booking engine with calendar and rates.", keywords: "booking حجز حجوزات", icon: CalendarDays, ...SOON },
  { id: "housekeeping", category: "hospitality", nameAr: "نظام التدبير المنزلي", nameEn: "Housekeeping Management System", descAr: "جداول التنظيف والغرف والمغاسل ومتابعة الجودة.", descEn: "Cleaning schedules, rooms, laundry and quality checks.", keywords: "housekeeping تدبير تنظيف غرف", icon: SprayCan, ...SOON },

  // ── Finance & Accounting (10) ────────────────────────────────
  { id: "accounting", category: "finance", nameAr: "النظام المحاسبي", nameEn: "Accounting System", descAr: "القيود والدفاتر والميزانية والقوائم المالية.", descEn: "Journals, ledgers, trial balance and statements.", keywords: "accounting محاسبة قيود", icon: Calculator, ...SOON },
  { id: "expense", category: "finance", nameAr: "نظام إدارة المصروفات", nameEn: "Expense Management System", descAr: "طلبات الصرف والاعتمادات والعهد والموافقات.", descEn: "Claims, advances, petty cash and approvals.", keywords: "expense مصروفات نفقات", icon: Banknote, ...SOON },
  { id: "invoice", category: "finance", nameAr: "نظام إدارة الفواتير", nameEn: "Invoice Management System", descAr: "الفواتير الضريبية والمدفوعات والتذكيرات.", descEn: "Tax invoices, payments and reminders.", keywords: "invoice فواتير", icon: FileText, ...SOON },
  { id: "payroll", category: "finance", nameAr: "نظام الرواتب", nameEn: "Payroll System", descAr: "الرواتب والبدلات والخصومات وكشوف البنوك.", descEn: "Salaries, allowances, deductions and bank files.", keywords: "payroll salary رواتب أجور", icon: HandCoins, ...SOON },
  { id: "tax", category: "finance", nameAr: "نظام إدارة الضرائب", nameEn: "Tax Management System", descAr: "الضريبة والزكاة والإقرارات والتقارير الضريبية.", descEn: "VAT, zakat, filings and tax reports.", keywords: "tax vat ضرائب زكاة", icon: Percent, ...SOON },
  { id: "cashflow", category: "finance", nameAr: "نظام التدفق النقدي", nameEn: "Cash Flow Management System", descAr: "الخزينة والبنوك والتوقعات والسيولة اليومية.", descEn: "Treasury, banks, forecasting and daily liquidity.", keywords: "cash flow سيولة خزينة", icon: TrendingUp, ...SOON },
  { id: "debt", category: "finance", nameAr: "نظام إدارة الديون", nameEn: "Debt Management System", descAr: "الذمم والتحصيل والأعمار والمتابعة القانونية.", descEn: "Receivables, collection, aging and follow-up.", keywords: "debt ديون ذمم تحصيل", icon: Scale, ...SOON },
  { id: "installment", category: "finance", nameAr: "نظام الأقساط", nameEn: "Installment Management System", descAr: "جداول الأقساط والاستحقاقات والغرامات والتحصيل.", descEn: "Schedules, dues, penalties and collection.", keywords: "installment أقساط تقسيط", icon: CreditCard, ...SOON },
  { id: "budget", category: "finance", nameAr: "نظام الموازنات", nameEn: "Budget Management System", descAr: "الموازنات التقديرية والمقارنة والانحرافات.", descEn: "Budgets, forecasts, variance and control.", keywords: "budget موازنة ميزانية", icon: PiggyBank, ...SOON },
  { id: "financial-reports", category: "finance", nameAr: "نظام التقارير المالية", nameEn: "Financial Reporting System", descAr: "المركز المالي والأرباح والتدفقات بلوحات ذكية.", descEn: "Balance sheet, P&L and cash flow dashboards.", keywords: "reports تقارير مالية قوائم", icon: ClipboardList, ...SOON },

  // ── Construction (10) ────────────────────────────────────────
  { id: "construction-company", category: "construction", nameAr: "نظام شركات المقاولات", nameEn: "Construction Company Management System", descAr: "إدارة شاملة لشركات المقاولات والمشاريع.", descEn: "Complete management for contracting companies.", keywords: "construction مقاولات", icon: Building, ...SOON },
  { id: "construction-project", category: "construction", nameAr: "نظام إدارة مشاريع البناء", nameEn: "Construction Project Management System", descAr: "الجداول الزمنية والمهام والتقدم والتقارير.", descEn: "Timelines, tasks, progress and reports.", keywords: "project مشروع بناء", icon: ListChecks, ...SOON },
  { id: "contractor", category: "construction", nameAr: "نظام إدارة المقاولين", nameEn: "Contractor Management System", descAr: "مقاولو الباطن والعقود والمستخلصات والتقييم.", descEn: "Subcontractors, contracts, certificates and rating.", keywords: "contractor مقاول باطن مستخلص", icon: UserCheck, ...SOON },
  { id: "building-materials", category: "construction", nameAr: "نظام مواد البناء", nameEn: "Building Materials Management System", descAr: "المخازن والطلبات والاستلام والاستهلاك للمواقع.", descEn: "Stock, orders, receiving and site consumption.", keywords: "materials مواد بناء أسمنت حديد", icon: Package, ...SOON },
  { id: "construction-equipment", category: "construction", nameAr: "نظام معدات البناء", nameEn: "Construction Equipment Management System", descAr: "المعدات والصيانة والتشغيل والتأجير الداخلي.", descEn: "Fleet, maintenance, utilization and internal rental.", keywords: "equipment معدات ثقيلة", icon: Forklift, ...SOON },
  { id: "construction-workers", category: "construction", nameAr: "نظام عمال المقاولات", nameEn: "Construction Worker Management System", descAr: "العمالة والحضور والأجور اليومية والسكن.", descEn: "Labor, attendance, daily wages and housing.", keywords: "workers عمال يومية", icon: HardHat, ...SOON },
  { id: "construction-accounting", category: "construction", nameAr: "محاسبة المقاولات", nameEn: "Construction Accounting System", descAr: "تكاليف المشاريع والمستخلصات وهوامش الربح.", descEn: "Job costing, certificates and margins.", keywords: "accounting محاسبة مقاولات تكاليف", icon: Calculator, ...SOON },
  { id: "construction-site", category: "construction", nameAr: "نظام إدارة المواقع", nameEn: "Construction Site Management System", descAr: "اليوميات والحركة والمخزون الموقعي والسلامة.", descEn: "Daily logs, movements, site stock and safety.", keywords: "site موقع إنشائي", icon: MapPin, ...SOON },
  { id: "procurement", category: "construction", nameAr: "نظام المشتريات", nameEn: "Procurement System", descAr: "طلبات الشراء والمناقصات والموردون والاعتماد.", descEn: "Purchase requests, tenders, vendors and approvals.", keywords: "procurement مشتريات مناقصات", icon: PackageCheck, ...SOON },
  { id: "estimation", category: "construction", nameAr: "نظام التقديرات", nameEn: "Construction Estimation System", descAr: "حصر الكميات والتسعير والعروض الفنية والمالية.", descEn: "Quantity takeoff, pricing and proposals.", keywords: "estimation تسعير حصر عروض أسعار", icon: Ruler, ...SOON },

  // ── Automotive (9) ───────────────────────────────────────────
  { id: "dealership", category: "automotive", nameAr: "نظام معارض السيارات", nameEn: "Car Dealership System", descAr: "المخزون والمبيعات والتمويل والتأمين والتسليم.", descEn: "Inventory, sales, financing, insurance and delivery.", keywords: "dealership معرض سيارات", icon: Car, ...SOON },
  { id: "car-rental", category: "automotive", nameAr: "نظام تأجير السيارات", nameEn: "Car Rental System", descAr: "الأسطول والحجوزات والعقود والصيانة والغرامات.", descEn: "Fleet, bookings, contracts, maintenance and fines.", keywords: "rental تأجير سيارات", icon: CarFront, ...SOON },
  { id: "garage", category: "automotive", nameAr: "نظام الورش والكراجات", nameEn: "Auto Repair / Garage System", descAr: "أوامر الإصلاح والقطع والفنيون والفواتير.", descEn: "Job cards, parts, technicians and invoices.", keywords: "garage repair ورشة إصلاح", icon: Wrench, ...SOON },
  { id: "car-wash", category: "automotive", nameAr: "نظام مغاسل السيارات", nameEn: "Car Wash Management System", descAr: "الباقات والاشتراكات والطوابير والمدفوعات.", descEn: "Packages, subscriptions, queues and payments.", keywords: "wash مغسلة سيارات غسيل", icon: Droplets, ...SOON },
  { id: "tire-shop", category: "automotive", nameAr: "نظام محلات الإطارات", nameEn: "Tire Shop System", descAr: "المقاسات والمخزون والتركيب والميزانية.", descEn: "Sizes, stock, fitting and alignment.", keywords: "tire إطارات كفرات بنشر", icon: LifeBuoy, ...SOON },
  { id: "spare-parts", category: "automotive", nameAr: "نظام قطع الغيار", nameEn: "Spare Parts Management System", descAr: "الفهارس والتوافق والمخزون والطلب والمبيعات.", descEn: "Catalogs, fitment, stock, ordering and sales.", keywords: "spare parts قطع غيار", icon: Cog, ...SOON },
  { id: "vehicle-maintenance", category: "automotive", nameAr: "نظام صيانة المركبات", nameEn: "Vehicle Maintenance System", descAr: "الجداول الوقائية والسجلات والتكاليف والتنبيهات.", descEn: "Preventive schedules, history, costs and alerts.", keywords: "maintenance صيانة مركبات", icon: Gauge, ...SOON },
  { id: "driving-school", category: "automotive", nameAr: "نظام مدارس القيادة", nameEn: "Driving School System", descAr: "المتدربون والحصص والمدربون والاختبارات.", descEn: "Trainees, lessons, instructors and tests.", keywords: "driving school تعليم قيادة رخصة", icon: Flag, ...SOON },
  { id: "fleet", category: "automotive", nameAr: "نظام إدارة الأساطيل", nameEn: "Fleet Management System", descAr: "المركبات والسائقون والوقود والصيانة والتتبع.", descEn: "Vehicles, drivers, fuel, maintenance and tracking.", keywords: "fleet أسطول مركبات", icon: Bus, ...SOON },

  // ── Education (10) ───────────────────────────────────────────
  { id: "school", category: "education", nameAr: "نظام إدارة المدارس", nameEn: "School Management System", descAr: "الطلاب والفصول والدرجات والحضور والرسوم.", descEn: "Students, classes, grades, attendance and fees.", keywords: "school مدرسة", icon: School, ...SOON },
  { id: "university", category: "education", nameAr: "نظام الجامعات", nameEn: "University Management System", descAr: "الكليات والتسجيل والخطط الدراسية والساعات.", descEn: "Faculties, enrollment, curricula and credits.", keywords: "university جامعة كلية", icon: Landmark, ...SOON },
  { id: "training-center", category: "education", nameAr: "نظام مراكز التدريب", nameEn: "Training Center System", descAr: "الدورات والمدربون والقاعات والشهادات.", descEn: "Courses, trainers, halls and certificates.", keywords: "training center تدريب دورات", icon: Presentation, ...SOON },
  { id: "institute", category: "education", nameAr: "نظام المعاهد", nameEn: "Institute Management System", descAr: "البرامج والدفعات والرسوم والشهادات.", descEn: "Programs, batches, fees and certification.", keywords: "institute معهد", icon: BookMarked, ...SOON },
  { id: "kindergarten", category: "education", nameAr: "نظام رياض الأطفال", nameEn: "Kindergarten Management System", descAr: "الأطفال والفصول والأنشطة والتواصل مع الأهالي.", descEn: "Children, classes, activities and parent updates.", keywords: "kindergarten روضة أطفال حضانة", icon: Shapes, ...SOON },
  { id: "student", category: "education", nameAr: "نظام شؤون الطلاب", nameEn: "Student Management System", descAr: "الملفات والسلوك والتواصل والأنشطة.", descEn: "Profiles, conduct, communication and activities.", keywords: "student طالب شؤون", icon: Backpack, ...SOON },
  { id: "exam", category: "education", nameAr: "نظام الاختبارات", nameEn: "Exam Management System", descAr: "الجداول والقاعات والتصحيح والنتائج والتحليل.", descEn: "Scheduling, halls, marking, results and analytics.", keywords: "exam test اختبارات امتحانات نتائج", icon: ClipboardCheck, ...SOON },
  { id: "online-course", category: "education", nameAr: "نظام الدورات الإلكترونية", nameEn: "Online Course Management System", descAr: "المحتوى والاشتراكات والتقدم والشهادات.", descEn: "Content, enrollments, progress and certificates.", keywords: "online course دورات أونلاين تعليم عن بعد", icon: Laptop, ...SOON },
  { id: "tuition", category: "education", nameAr: "نظام الرسوم الدراسية", nameEn: "Tuition Management System", descAr: "الفوترة والأقساط والخصومات والتحصيل.", descEn: "Billing, installments, discounts and collection.", keywords: "tuition fees رسوم دراسية أقساط", icon: Coins, ...SOON },
  { id: "library", category: "education", nameAr: "نظام المكتبات", nameEn: "Library Management System", descAr: "الفهرسة والإعارة والإرجاع والغرامات والأعضاء.", descEn: "Cataloging, lending, returns, fines and members.", keywords: "library مكتبة إعارة كتب", icon: Library, ...SOON },

  // ── Professional Services (10) ───────────────────────────────
  { id: "law-firm", category: "professional", nameAr: "نظام مكاتب المحاماة", nameEn: "Law Firm Management System", descAr: "القضايا والجلسات والعملاء والأتعاب والمواعيد.", descEn: "Cases, hearings, clients, fees and calendar.", keywords: "law lawyer محاماة قضايا", icon: Gavel, ...SOON },
  { id: "accounting-firm", category: "professional", nameAr: "نظام مكاتب المحاسبة", nameEn: "Accounting Firm Management System", descAr: "عملاء المكتب والمهام الدورية والإقرارات.", descEn: "Firm clients, recurring tasks and filings.", keywords: "accounting firm مكتب محاسبة", icon: Calculator, ...SOON },
  { id: "consulting", category: "professional", nameAr: "نظام شركات الاستشارات", nameEn: "Consulting Company System", descAr: "المشاريع والساعات الاستشارية والعروض والفواتير.", descEn: "Engagements, billable hours, proposals and billing.", keywords: "consulting استشارات", icon: Lightbulb, ...SOON },
  { id: "marketing-agency", category: "professional", nameAr: "نظام وكالات التسويق", nameEn: "Marketing Agency System", descAr: "الحملات والعملاء والمحتوى والتقارير والفواتير.", descEn: "Campaigns, clients, content, reports and billing.", keywords: "marketing agency تسويق حملات إعلان", icon: Megaphone, ...SOON },
  { id: "software-company", category: "professional", nameAr: "نظام شركات البرمجيات", nameEn: "Software Company Management System", descAr: "المشاريع والإصدارات والدعم والاشتراكات.", descEn: "Projects, releases, support and subscriptions.", keywords: "software تقنية برمجيات", icon: Braces, ...SOON },
  { id: "architecture", category: "professional", nameAr: "نظام المكاتب المعمارية", nameEn: "Architecture Firm System", descAr: "المشاريع والمخططات والتراخيص والمستخلصات.", descEn: "Projects, drawings, permits and billings.", keywords: "architecture معماري مخططات هندسة", icon: Compass, ...SOON },
  { id: "engineering", category: "professional", nameAr: "نظام المكاتب الهندسية", nameEn: "Engineering Firm System", descAr: "المشاريع والدراسات والإشراف والتقارير.", descEn: "Projects, studies, supervision and reports.", keywords: "engineering هندسة", icon: Cpu, ...SOON },
  { id: "realestate-agency", category: "professional", nameAr: "نظام الوكالات العقارية", nameEn: "Real Estate Agency System", descAr: "العروض والعملاء والجولات والعمولات.", descEn: "Listings, clients, viewings and commissions.", keywords: "agency عقارات وساطة", icon: Handshake, ...SOON },
  { id: "hr-agency", category: "professional", nameAr: "نظام وكالات التوظيف", nameEn: "HR Agency System", descAr: "المرشحون والشواغر والمقابلات والتوظيف.", descEn: "Candidates, vacancies, interviews and placement.", keywords: "recruitment توظيف موارد بشرية", icon: UserPlus, ...SOON },
  { id: "translation", category: "professional", nameAr: "نظام مكاتب الترجمة", nameEn: "Translation Agency System", descAr: "المشاريع واللغات والمترجمون والتسليم والفوترة.", descEn: "Projects, languages, translators, delivery and billing.", keywords: "translation ترجمة", icon: Languages, ...SOON },

  // ── Real Estate (10) ─────────────────────────────────────────
  { id: "property", category: "realestate", nameAr: "نظام إدارة العقارات", nameEn: "Property Management System", descAr: "المحفظة العقارية والعقود والتحصيل والصيانة.", descEn: "Portfolio, contracts, collection and maintenance.", keywords: "property عقارات إدارة أملاك", icon: Building2, ...SOON },
  { id: "realestate-crm", category: "realestate", nameAr: "نظام علاقات العملاء العقاري", nameEn: "Real Estate CRM", descAr: "العملاء المحتملون والمتابعة والصفقات والعمولات.", descEn: "Leads, follow-up, deals and commissions.", keywords: "crm عملاء عقاري مبيعات", icon: HeartHandshake, ...SOON },
  { id: "property-rental", category: "realestate", nameAr: "نظام تأجير العقارات", nameEn: "Property Rental Management System", descAr: "الوحدات والعقود والدفعات والإخلاء والتجديد.", descEn: "Units, leases, payments, vacating and renewal.", keywords: "rental تأجير إيجارات", icon: KeyRound, ...SOON },
  { id: "property-sales", category: "realestate", nameAr: "نظام مبيعات العقارات", nameEn: "Property Sales Management System", descAr: "المشاريع والوحدات والحجوزات والدفعات والتسليم.", descEn: "Projects, units, reservations, payments and handover.", keywords: "sales مبيعات عقارات تملك", icon: Tag, ...SOON },
  { id: "tenant", category: "realestate", nameAr: "نظام إدارة المستأجرين", nameEn: "Tenant Management System", descAr: "الملفات والعقود والبلاغات والتحصيل والتقييم.", descEn: "Profiles, leases, tickets, collection and rating.", keywords: "tenant مستأجرون", icon: Users, ...SOON },
  { id: "land", category: "realestate", nameAr: "نظام إدارة الأراضي", nameEn: "Land Management System", descAr: "القطع والصكوك والتخطيط والبيع والتطوير.", descEn: "Plots, deeds, planning, sales and development.", keywords: "land أراضي مخططات", icon: Mountain, ...SOON },
  { id: "property-maintenance", category: "realestate", nameAr: "نظام صيانة العقارات", nameEn: "Property Maintenance System", descAr: "بلاغات الصيانة والفنيون والجداول والتكاليف.", descEn: "Tickets, technicians, schedules and costs.", keywords: "maintenance صيانة عقارات", icon: Wrench, ...SOON },
  { id: "realestate-accounting", category: "realestate", nameAr: "محاسبة العقارات", nameEn: "Real Estate Accounting System", descAr: "الإيرادات والمصاريف لكل عقار ومراكز التكلفة.", descEn: "Per-property income, expenses and cost centers.", keywords: "accounting محاسبة عقارات", icon: Calculator, ...SOON },
  { id: "building-mgmt", category: "realestate", nameAr: "نظام إدارة المباني", nameEn: "Building Management System", descAr: "المرافق والحراسة والمواقف ورسوم الخدمات.", descEn: "Facilities, security, parking and service charges.", keywords: "building مباني اتحاد ملاك", icon: Building, ...SOON },
  { id: "facility", category: "realestate", nameAr: "نظام إدارة المرافق", nameEn: "Facility Management System", descAr: "التشغيل والصيانة الوقائية والطاقة والموردون.", descEn: "Operations, preventive maintenance, energy and vendors.", keywords: "facility مرافق تشغيل", icon: SlidersHorizontal, ...SOON },

  // ── Logistics & Transportation (10) ──────────────────────────
  { id: "logistics", category: "logistics", nameAr: "نظام إدارة اللوجستيات", nameEn: "Logistics Management System", descAr: "الشحنات والمسارات والمستودعات والتتبع.", descEn: "Shipments, routes, warehouses and tracking.", keywords: "logistics لوجستيات شحن", icon: Container, ...SOON },
  { id: "delivery-mgmt", category: "logistics", nameAr: "نظام إدارة التوصيل", nameEn: "Delivery Management System", descAr: "الطلبات والمناطق والسائقون والإثباتات.", descEn: "Orders, zones, drivers and proof of delivery.", keywords: "delivery توصيل", icon: Send, ...SOON },
  { id: "courier", category: "logistics", nameAr: "نظام شركات الشحن السريع", nameEn: "Courier Management System", descAr: "الشحنات والفروع والوكلاء والتحصيل عند الاستلام.", descEn: "Parcels, branches, agents and COD.", keywords: "courier شحن سريع طرود", icon: Navigation, ...SOON },
  { id: "fleet-mgmt", category: "logistics", nameAr: "نظام إدارة الأسطول", nameEn: "Fleet Management System", descAr: "الشاحنات والسائقون والوقود والصيانة والرحلات.", descEn: "Trucks, drivers, fuel, maintenance and trips.", keywords: "fleet أسطول شاحنات نقل", icon: Truck, ...SOON },
  { id: "warehouse", category: "logistics", nameAr: "نظام إدارة المستودعات", nameEn: "Warehouse Management System", descAr: "المواقع والرفوف والجرد والاستلام والصرف.", descEn: "Locations, racks, cycle counts, inbound and outbound.", keywords: "warehouse مستودع مخازن", icon: Warehouse, ...SOON },
  { id: "inventory", category: "logistics", nameAr: "نظام إدارة المخزون", nameEn: "Inventory Management System", descAr: "الأصناف والحدود والحركة والتقييم والجرد.", descEn: "Items, reorder points, movements, valuation and counts.", keywords: "inventory stock مخزون جرد", icon: Archive, ...SOON },
  { id: "shipping", category: "logistics", nameAr: "نظام إدارة الشحن", nameEn: "Shipping Management System", descAr: "البواليص والخطوط والتخليص والتكاليف.", descEn: "Bills of lading, lines, clearance and costs.", keywords: "shipping شحن بحري جوي", icon: Ship, ...SOON },
  { id: "driver", category: "logistics", nameAr: "نظام إدارة السائقين", nameEn: "Driver Management System", descAr: "الملفات والرخص والرحلات والحوافز والمخالفات.", descEn: "Profiles, licenses, trips, incentives and violations.", keywords: "driver سائقون", icon: BadgeCheck, ...SOON },
  { id: "transport", category: "logistics", nameAr: "نظام إدارة النقل", nameEn: "Transportation Management System", descAr: "الخطوط والجداول والحجوزات والتذاكر.", descEn: "Lines, schedules, bookings and tickets.", keywords: "transport نقل بري ركاب", icon: Route, ...SOON },
  { id: "dispatch", category: "logistics", nameAr: "نظام الإرساليات", nameEn: "Dispatch System", descAr: "توزيع المهام على السائقين والمتابعة اللحظية.", descEn: "Task dispatching with live driver tracking.", keywords: "dispatch إرسال توزيع مهام", icon: Radio, ...SOON },

  // ── Manufacturing (10) ───────────────────────────────────────
  { id: "manufacturing-erp", category: "manufacturing", nameAr: "نظام تخطيط التصنيع", nameEn: "Manufacturing ERP", descAr: "التخطيط والموارد والتكاليف وسلاسل الإمداد.", descEn: "Planning, resources, costing and supply chain.", keywords: "erp تصنيع تخطيط موارد", icon: Network, ...SOON },
  { id: "production", category: "manufacturing", nameAr: "نظام إدارة الإنتاج", nameEn: "Production Management System", descAr: "أوامر الإنتاج والخطوط والجودة والتوقفات.", descEn: "Work orders, lines, quality and downtimes.", keywords: "production إنتاج خطوط", icon: Workflow, ...SOON },
  { id: "factory", category: "manufacturing", nameAr: "نظام إدارة المصانع", nameEn: "Factory Management System", descAr: "التشغيل والورديات والعمالة والمرافق.", descEn: "Operations, shifts, labor and utilities.", keywords: "factory مصنع", icon: Factory, ...SOON },
  { id: "raw-materials", category: "manufacturing", nameAr: "نظام المواد الخام", nameEn: "Raw Materials Management System", descAr: "المخزون والاستهلاك وإعادة الطلب والموردون.", descEn: "Stock, consumption, reorder and suppliers.", keywords: "raw materials مواد خام", icon: Boxes, ...SOON },
  { id: "mfg-inventory", category: "manufacturing", nameAr: "مخزون التصنيع", nameEn: "Manufacturing Inventory System", descAr: "الخام وتحت التشغيل والمنتج التام والدفعات.", descEn: "Raw, WIP and finished goods with batches.", keywords: "inventory مخزون تصنيع", icon: Archive, ...SOON },
  { id: "quality", category: "manufacturing", nameAr: "نظام ضبط الجودة", nameEn: "Quality Control System", descAr: "الفحص والمعايير وعدم المطابقة والإجراءات.", descEn: "Inspection, standards, NCRs and CAPA.", keywords: "quality جودة فحص", icon: ShieldCheck, ...SOON },
  { id: "production-planning", category: "manufacturing", nameAr: "نظام تخطيط الإنتاج", nameEn: "Production Planning System", descAr: "الخطط والطاقات والجدولة والاحتياجات.", descEn: "Plans, capacity, scheduling and MRP.", keywords: "planning تخطيط إنتاج جدولة", icon: CalendarClock, ...SOON },
  { id: "machine-maintenance", category: "manufacturing", nameAr: "نظام صيانة المكائن", nameEn: "Machine Maintenance System", descAr: "الوقائية والتصحيحية والقطع وسجل الأعطال.", descEn: "Preventive, corrective, spares and failure logs.", keywords: "machine maintenance صيانة مكائن معدات", icon: Settings, ...SOON },
  { id: "mfg-purchase", category: "manufacturing", nameAr: "نظام مشتريات التصنيع", nameEn: "Manufacturing Purchase System", descAr: "طلبات المواد والمناقصات والاستلام والفواتير.", descEn: "Material requests, tenders, GRN and invoices.", keywords: "purchase مشتريات تصنيع", icon: ShoppingCart, ...SOON },
  { id: "supplier", category: "manufacturing", nameAr: "نظام إدارة الموردين", nameEn: "Supplier Management System", descAr: "التأهيل والتقييم والعقود والأداء.", descEn: "Qualification, rating, contracts and performance.", keywords: "supplier موردون", icon: Contact, ...SOON },

  // ── Beauty & Personal Care (8) ───────────────────────────────
  { id: "salon", category: "beauty", nameAr: "نظام إدارة الصالونات", nameEn: "Salon Management System", descAr: "الحجوزات والخدمات والموظفون والباقات.", descEn: "Bookings, services, staff and packages.", keywords: "salon صالون نسائي", icon: Scissors, ...SOON },
  { id: "barber", category: "beauty", nameAr: "نظام صالونات الحلاقة", nameEn: "Barber Shop System", descAr: "الطوابير والحلاقون والخدمات والمدفوعات.", descEn: "Queues, barbers, services and payments.", keywords: "barber حلاقة رجالي", icon: Brush, ...SOON },
  { id: "beauty-center", category: "beauty", nameAr: "نظام مراكز التجميل", nameEn: "Beauty Center System", descAr: "الجلسات والباقات والمنتجات والعضويات.", descEn: "Sessions, packages, products and memberships.", keywords: "beauty center تجميل مركز", icon: Sparkles, ...SOON },
  { id: "spa", category: "beauty", nameAr: "نظام إدارة السبا", nameEn: "Spa Management System", descAr: "البرامج والغرف والمعالجون والحجوزات.", descEn: "Programs, rooms, therapists and bookings.", keywords: "spa سبا مساج استرخاء", icon: Flower2, ...SOON },
  { id: "nail-salon", category: "beauty", nameAr: "نظام صالون الأظافر", nameEn: "Nail Salon System", descAr: "الخدمات والفنيات والمواعيد والمنتجات.", descEn: "Services, technicians, appointments and retail.", keywords: "nail أظافر مناكير", icon: Paintbrush, ...SOON },
  { id: "tattoo", category: "beauty", nameAr: "نظام استوديو الوشم", nameEn: "Tattoo Studio Management System", descAr: "الفنانون والجلسات والتصاميم والموافقات.", descEn: "Artists, sessions, designs and consents.", keywords: "tattoo وشم تاتو", icon: PenTool, ...SOON },
  { id: "beauty-booking", category: "beauty", nameAr: "نظام حجوزات التجميل", nameEn: "Beauty Appointment System", descAr: "حجوزات متعددة الفروع مع التذكيرات.", descEn: "Multi-branch bookings with reminders.", keywords: "appointment booking حجز مواعيد", icon: CalendarCheck, ...SOON },
  { id: "membership", category: "beauty", nameAr: "نظام العضويات", nameEn: "Membership Management System", descAr: "الباقات والنقاط والتجديد والولاء.", descEn: "Plans, points, renewals and loyalty.", keywords: "membership عضويات ولاء", icon: Ticket, ...SOON },

  // ── Fitness & Sports (7) ─────────────────────────────────────
  { id: "gym", category: "fitness", nameAr: "نظام إدارة النوادي الرياضية", nameEn: "Gym Management System", descAr: "الأعضاء والاشتراكات والمدربون والحضور.", descEn: "Members, subscriptions, trainers and check-ins.", keywords: "gym نادي رياضي جيم", icon: Dumbbell, ...SOON },
  { id: "fitness-center", category: "fitness", nameAr: "نظام مراكز اللياقة", nameEn: "Fitness Center System", descAr: "البرامج والحصص الجماعية والتقييمات.", descEn: "Programs, group classes and assessments.", keywords: "fitness لياقة", icon: Activity, ...SOON },
  { id: "trainer", category: "fitness", nameAr: "نظام المدربين الشخصيين", nameEn: "Personal Trainer Management System", descAr: "الحصص الخاصة والخطط والمتابعة والفوترة.", descEn: "PT sessions, plans, tracking and billing.", keywords: "trainer مدرب شخصي", icon: Medal, ...SOON },
  { id: "sports-club", category: "fitness", nameAr: "نظام الأندية الرياضية", nameEn: "Sports Club Management System", descAr: "الفرق والبطولات والملاعب والعضويات.", descEn: "Teams, tournaments, fields and memberships.", keywords: "sports club نادي رياضي فريق", icon: Trophy, ...SOON },
  { id: "pool", category: "fitness", nameAr: "نظام المسابح", nameEn: "Swimming Pool Management System", descAr: "الحصص والاشتراكات والمنقذون والصيانة.", descEn: "Lessons, passes, lifeguards and maintenance.", keywords: "pool swimming مسبح سباحة", icon: Waves, ...SOON },
  { id: "fitness-membership", category: "fitness", nameAr: "نظام اشتراكات اللياقة", nameEn: "Fitness Membership System", descAr: "الباقات والتجميد والتجديد والتحصيل.", descEn: "Plans, freezes, renewals and collection.", keywords: "membership اشتراكات", icon: Wallet, ...SOON },
  { id: "training-schedule", category: "fitness", nameAr: "نظام جداول التدريب", nameEn: "Training Schedule System", descAr: "الجداول والحجوزات والسعة والإشعارات.", descEn: "Schedules, bookings, capacity and notifications.", keywords: "schedule جدول تدريب حصص", icon: Clock3, ...SOON },

  // ── Service Businesses (9) ───────────────────────────────────
  { id: "cleaning", category: "services", nameAr: "نظام شركات التنظيف", nameEn: "Cleaning Company System", descAr: "العقود والزيارات والفرق والمواد والفواتير.", descEn: "Contracts, visits, crews, materials and billing.", keywords: "cleaning تنظيف", icon: SprayCan, ...SOON },
  { id: "maintenance-co", category: "services", nameAr: "نظام شركات الصيانة", nameEn: "Maintenance Company System", descAr: "بلاغات العمل والفنيون والعقود السنوية.", descEn: "Job orders, technicians and annual contracts.", keywords: "maintenance صيانة", icon: Wrench, ...SOON },
  { id: "plumbing", category: "services", nameAr: "نظام شركات السباكة", nameEn: "Plumbing Company System", descAr: "الطلبات والفنيون والقطع والضمان والفوترة.", descEn: "Jobs, plumbers, parts, warranty and billing.", keywords: "plumbing سباكة", icon: Droplet, ...SOON },
  { id: "electrical", category: "services", nameAr: "نظام شركات الكهرباء", nameEn: "Electrical Company System", descAr: "التمديدات والصيانة والفنيون والسلامة.", descEn: "Wiring, maintenance, electricians and safety.", keywords: "electrical كهرباء", icon: Zap, ...SOON },
  { id: "hvac", category: "services", nameAr: "نظام شركات التكييف", nameEn: "AC / HVAC Company System", descAr: "التركيب والصيانة الدورية والعقود والقطع.", descEn: "Installation, periodic maintenance, contracts and parts.", keywords: "hvac ac تكييف تبريد", icon: Wind, ...SOON },
  { id: "pest-control", category: "services", nameAr: "نظام مكافحة الحشرات", nameEn: "Pest Control System", descAr: "الزيارات الدورية والمعالجات والمواد والتقارير.", descEn: "Recurring visits, treatments, chemicals and reports.", keywords: "pest حشرات مكافحة رش", icon: Monitor, ...SOON },
  { id: "security-co", category: "services", nameAr: "نظام شركات الأمن", nameEn: "Security Company System", descAr: "الحراس والمواقع والورديات والبلاغات.", descEn: "Guards, sites, shifts and incidents.", keywords: "security أمن حراسة", icon: Fingerprint, ...SOON },
  { id: "landscaping", category: "services", nameAr: "نظام تنسيق الحدائق", nameEn: "Landscaping System", descAr: "المشاريع والصيانة الدورية والري والنباتات.", descEn: "Projects, recurring care, irrigation and plants.", keywords: "landscaping حدائق تنسيق", icon: TreePine, ...SOON },
  { id: "home-services", category: "services", nameAr: "نظام الخدمات المنزلية", nameEn: "Home Services Management System", descAr: "منصة طلبات منزلية مع الفنيين والتقييم.", descEn: "On-demand home jobs with pros and ratings.", keywords: "home services خدمات منزلية", icon: LayoutGrid, ...SOON },

  // ── E-Commerce (10) ──────────────────────────────────────────
  { id: "ecommerce", category: "ecommerce", nameAr: "نظام التجارة الإلكترونية", nameEn: "E-Commerce Management System", descAr: "المتجر والطلبات والمدفوعات والشحن والتقارير.", descEn: "Storefront, orders, payments, shipping and reports.", keywords: "ecommerce متجر إلكتروني", icon: Globe, ...SOON },
  { id: "marketplace", category: "ecommerce", nameAr: "نظام السوق متعدد البائعين", nameEn: "Multi-Vendor Marketplace System", descAr: "البائعون والعمولات والتسويات والمنتجات.", descEn: "Vendors, commissions, settlements and products.", keywords: "marketplace سوق بائعون", icon: Store, ...SOON },
  { id: "order-mgmt", category: "ecommerce", nameAr: "نظام إدارة الطلبات", nameEn: "Order Management System", descAr: "دورة الطلب من الدفع حتى التسليم والإرجاع.", descEn: "Order lifecycle from payment to delivery and returns.", keywords: "orders طلبات", icon: ClipboardList, ...SOON },
  { id: "product-mgmt", category: "ecommerce", nameAr: "نظام إدارة المنتجات", nameEn: "Product Management System", descAr: "الكتالوج والمتغيرات والأسعار والمخزون.", descEn: "Catalog, variants, pricing and stock.", keywords: "products منتجات كتالوج", icon: Package, ...SOON },
  { id: "customer-mgmt", category: "ecommerce", nameAr: "نظام إدارة العملاء", nameEn: "Customer Management System", descAr: "الشرائح والولاء والتواصل وسجل الطلبات.", descEn: "Segments, loyalty, messaging and order history.", keywords: "customers عملاء", icon: Users, ...SOON },
  { id: "seller", category: "ecommerce", nameAr: "نظام إدارة البائعين", nameEn: "Seller Management System", descAr: "التأهيل والمنتجات والمدفوعات والتقييم.", descEn: "Onboarding, products, payouts and ratings.", keywords: "seller بائعون تجار", icon: Briefcase, ...SOON },
  { id: "ecom-delivery", category: "ecommerce", nameAr: "نظام توصيل المتاجر", nameEn: "E-Commerce Delivery System", descAr: "شركات الشحن والأسعار والتتبع والإرجاع.", descEn: "Carriers, rates, tracking and returns.", keywords: "delivery توصيل شحن", icon: Bike, ...SOON },
  { id: "coupons", category: "ecommerce", nameAr: "نظام الكوبونات والخصومات", nameEn: "Coupon & Discount System", descAr: "الأكواد والحملات والشروط والتحليل.", descEn: "Codes, campaigns, rules and analytics.", keywords: "coupon discount كوبون خصم عروض", icon: Gift, ...SOON },
  { id: "returns", category: "ecommerce", nameAr: "نظام المرتجعات", nameEn: "Returns Management System", descAr: "الطلبات والفحص والاسترداد والاستبدال.", descEn: "Requests, inspection, refunds and exchanges.", keywords: "returns مرتجعات استرجاع", icon: RotateCcw, ...SOON },
  { id: "subscription-commerce", category: "ecommerce", nameAr: "نظام الاشتراكات التجارية", nameEn: "Subscription Commerce System", descAr: "الخطط والفوترة الدورية والتجديد والإلغاء.", descEn: "Plans, recurring billing, renewals and churn.", keywords: "subscription اشتراكات دورية", icon: Repeat, ...SOON },

  // ── Agriculture (9) ──────────────────────────────────────────
  { id: "farm", category: "agriculture", nameAr: "نظام إدارة المزارع", nameEn: "Farm Management System", descAr: "الحقول والمحاصيل والعمالة والتكاليف.", descEn: "Fields, crops, labor and costs.", keywords: "farm مزرعة", icon: Sprout, ...SOON },
  { id: "agri-inventory", category: "agriculture", nameAr: "مخزون المستلزمات الزراعية", nameEn: "Agricultural Inventory System", descAr: "البذور والأسمدة والمبيدات والمعدات.", descEn: "Seeds, fertilizers, pesticides and tools.", keywords: "inventory مخزون زراعي", icon: Archive, ...SOON },
  { id: "livestock", category: "agriculture", nameAr: "نظام الثروة الحيوانية", nameEn: "Livestock Management System", descAr: "القطعان والصحة والتلقيح والإنتاج.", descEn: "Herds, health, breeding and yield.", keywords: "livestock مواشي أغنام أبقار", icon: PawPrint, ...SOON },
  { id: "poultry", category: "agriculture", nameAr: "نظام مزارع الدواجن", nameEn: "Poultry Farm System", descAr: "العنابر والقطعان والأعلاف والإنتاج اليومي.", descEn: "Houses, flocks, feed and daily production.", keywords: "poultry دواجن دجاج بيض", icon: Bird, ...SOON },
  { id: "dairy", category: "agriculture", nameAr: "نظام مزارع الألبان", nameEn: "Dairy Farm System", descAr: "الحليب اليومي والجودة والتوزيع والقطيع.", descEn: "Daily milk, quality, distribution and herd.", keywords: "dairy ألبان حليب", icon: Milk, ...SOON },
  { id: "irrigation", category: "agriculture", nameAr: "نظام الري", nameEn: "Irrigation Management System", descAr: "الجداول والشبكات والاستهلاك والصيانة.", descEn: "Schedules, networks, consumption and upkeep.", keywords: "irrigation ري سقي مياه", icon: Droplets, ...SOON },
  { id: "crop", category: "agriculture", nameAr: "نظام إدارة المحاصيل", nameEn: "Crop Management System", descAr: "المواسم والزراعة والحصاد والآفات.", descEn: "Seasons, planting, harvest and pests.", keywords: "crop محاصيل زراعة حصاد", icon: Leaf, ...SOON },
  { id: "agri-sales", category: "agriculture", nameAr: "نظام المبيعات الزراعية", nameEn: "Agricultural Sales System", descAr: "المحاصيل والعملاء والأسواق والتحصيل.", descEn: "Produce, buyers, markets and collection.", keywords: "sales مبيعات زراعية سوق", icon: TrendingUp, ...SOON },
  { id: "agri-equipment", category: "agriculture", nameAr: "نظام المعدات الزراعية", nameEn: "Agricultural Equipment System", descAr: "الجرارات والصيانة والتشغيل والوقود.", descEn: "Tractors, maintenance, utilization and fuel.", keywords: "equipment معدات زراعية جرارات", icon: Tractor, ...SOON },

  // ── Enterprise (11) ──────────────────────────────────────────
  { id: "erp", category: "enterprise", nameAr: "نظام تخطيط موارد المؤسسات", nameEn: "ERP System", descAr: "تكامل المالية والمخزون والمشتريات والمبيعات.", descEn: "Integrated finance, stock, purchasing and sales.", keywords: "erp موارد مؤسسة", icon: LayoutDashboard, ...SOON },
  { id: "crm", category: "enterprise", nameAr: "نظام إدارة علاقات العملاء", nameEn: "CRM System", descAr: "العملاء المحتملون والفرص والمتابعة والمبيعات.", descEn: "Leads, pipeline, follow-up and sales.", keywords: "crm عملاء مبيعات", icon: HeartHandshake, ...SOON },
  { id: "hr", category: "enterprise", nameAr: "نظام الموارد البشرية", nameEn: "HR Management System", descAr: "التوظيف والعقود والتقييم والتدريب.", descEn: "Hiring, contracts, appraisals and training.", keywords: "hr موارد بشرية", icon: Users, ...SOON },
  { id: "employee", category: "enterprise", nameAr: "نظام إدارة الموظفين", nameEn: "Employee Management System", descAr: "الملفات والرواتب والإجازات والحضور.", descEn: "Profiles, payroll, leave and attendance.", keywords: "employee موظفون", icon: UserCheck, ...SOON },
  { id: "attendance", category: "enterprise", nameAr: "نظام الحضور والانصراف", nameEn: "Attendance Management System", descAr: "البصمة والورديات والتأخير والإضافي.", descEn: "Biometric, shifts, lateness and overtime.", keywords: "attendance حضور بصمة دوام", icon: Timer, ...SOON },
  { id: "leave", category: "enterprise", nameAr: "نظام الإجازات", nameEn: "Leave Management System", descAr: "الأرصدة والطلبات والاعتمادات والتقويم.", descEn: "Balances, requests, approvals and calendar.", keywords: "leave إجازات", icon: Umbrella, ...SOON },
  { id: "procurement-mgmt", category: "enterprise", nameAr: "نظام إدارة المشتريات", nameEn: "Procurement Management System", descAr: "الطلبات والموردون والاعتمادات والاستلام.", descEn: "Requisitions, vendors, approvals and receiving.", keywords: "procurement مشتريات", icon: PackageCheck, ...SOON },
  { id: "asset", category: "enterprise", nameAr: "نظام إدارة الأصول", nameEn: "Asset Management System", descAr: "الجرد والإهلاك والنقل والصيانة للأصول.", descEn: "Registry, depreciation, transfers and upkeep.", keywords: "asset أصول عهد", icon: Boxes, ...SOON },
  { id: "document", category: "enterprise", nameAr: "نظام إدارة الوثائق", nameEn: "Document Management System", descAr: "الأرشفة والنسخ والصلاحيات والبحث.", descEn: "Archiving, versions, permissions and search.", keywords: "document وثائق أرشفة مستندات", icon: FolderOpen, ...SOON },
  { id: "workflow", category: "enterprise", nameAr: "نظام سير العمل", nameEn: "Workflow Management System", descAr: "المهام والاعتمادات والأتمتة والتنبيهات.", descEn: "Tasks, approvals, automation and alerts.", keywords: "workflow سير عمل مهام اعتماد", icon: Workflow, ...SOON },
  { id: "helpdesk", category: "enterprise", nameAr: "نظام الدعم الداخلي", nameEn: "Internal Help Desk System", descAr: "التذاكر والأولويات والاتفاقيات والمعرفة.", descEn: "Tickets, priorities, SLAs and knowledge base.", keywords: "helpdesk دعم تذاكر", icon: Headphones, ...SOON },
];

export const CATEGORY_MAP: ReadonlyMap<string, SystemCategory> = new Map(
  SYSTEM_CATEGORIES.map((c) => [c.id, c]),
);

export function countByCategory(categoryId: string): number {
  return BUSINESS_SYSTEMS.filter((s) => s.category === categoryId).length;
}
