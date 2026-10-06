import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { hash } from "bcryptjs"

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "dental" }
)
const prisma = new PrismaClient({ adapter })

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@dentalclinic.ye"
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345"

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function randomDaysAgo() {
  return daysAgo(1 + Math.floor(Math.random() * 20))
}

async function wipeDatabase() {
  const tables: { deleteMany: (args?: object) => Promise<unknown> }[] = [
    prisma.installment,
    prisma.paymentPlan,
    prisma.payment,
    prisma.invoiceItem,
    prisma.invoice,
    prisma.labCase,
    prisma.stockMovement,
    prisma.product,
    prisma.supplier,
    prisma.expense,
    prisma.communication,
    prisma.notification,
    prisma.session,
    prisma.auditLog,
    prisma.setting,
    prisma.consentForm,
    prisma.document,
    prisma.imaging,
    prisma.prescriptionItem,
    prisma.prescription,
    prisma.toothCondition,
    prisma.toothRecord,
    prisma.medicalHistory,
    prisma.dentalHistory,
    prisma.patientAlert,
    prisma.clinicalNote,
    prisma.diagnosis,
    prisma.treatmentPlanProcedure,
    prisma.treatmentPlan,
    prisma.waitingEntry,
    prisma.appointment,
    prisma.chair,
    prisma.room,
    prisma.dentist,
    prisma.user,
    prisma.role,
    prisma.patient,
    prisma.branch,
    prisma.clinic,
    prisma.medication,
    prisma.procedure,
  ]
  for (const t of tables) {
    await t.deleteMany({})
  }
}

async function main() {
  console.log("🌱 Seeding dental clinic database…")
  await wipeDatabase()

  // ---------- Clinic ----------
  const clinic = await prisma.clinic.create({
    data: {
      name: "Dar Al-Asnan Dental Clinic",
      nameAr: "دار الأسنان لطب الأسنان",
      phone: "+967 1 445 678",
      email: "info@darlasnan.ye",
      address: "Zubairi Street, Sana'a",
      governorate: "Sana'a",
      city: "Sana'a",
      currency: process.env.SEED_CURRENCY ?? "YER",
      timezone: "Asia/Aden",
      taxRate: 5,
      invoicePrefix: "INV",
      onboardingComplete: true,
      defaultLanguage: "ar",
      toothNumberingSystem: "FDI",
    },
  })

  // ---------- Branches ----------
  const mainBranch = await prisma.branch.create({
    data: {
      clinicId: clinic.id,
      name: "Main Branch",
      nameAr: "الفرع الرئيسي",
      address: "Zubairi Street, Sana'a",
      governorate: "Sana'a",
      city: "Sana'a",
      phone: "+967 1 445 678",
    },
  })
  await prisma.branch.create({
    data: {
      clinicId: clinic.id,
      name: "Aden Branch",
      nameAr: "فرع عدن",
      address: "Khormaksar, Aden",
      governorate: "Aden",
      city: "Aden",
      phone: "+967 2 232 456",
    },
  })
  await prisma.branch.create({
    data: {
      clinicId: clinic.id,
      name: "Taiz Branch",
      nameAr: "فرع تعز",
      address: "Al-Mudhaffar, Taiz",
      governorate: "Taiz",
      city: "Taiz",
      phone: "+967 4 211 993",
    },
  })

  // ---------- Roles ----------
  const roles: Record<string, { name: string; nameAr: string; permissions: string[] }> = {
    SUPER_ADMIN: {
      name: "Super Admin",
      nameAr: "مدير النظام",
      permissions: [
        "dashboard:view", "patients:view", "patients:create", "patients:edit", "patients:delete",
        "appointments:view", "appointments:create", "appointments:edit", "appointments:delete",
        "waitingRoom:view", "waitingRoom:create", "waitingRoom:edit",
        "clinical:view", "clinical:create", "clinical:edit",
        "dentalChart:view", "dentalChart:create", "dentalChart:edit",
        "diagnoses:view", "diagnoses:create", "diagnoses:edit",
        "treatmentPlans:view", "treatmentPlans:create", "treatmentPlans:edit", "treatmentPlans:approve",
        "prescriptions:view", "prescriptions:create", "prescriptions:print",
        "imaging:view", "imaging:create", "imaging:delete",
        "docs:view", "docs:create", "docs:delete",
        "consents:view", "consents:create", "consents:print",
        "invoices:view", "invoices:create", "invoices:edit", "invoices:print", "invoices:refund", "invoices:delete",
        "payments:view", "payments:create", "payments:refund",
        "installments:view", "installments:create", "installments:edit",
        "expenses:view", "expenses:create", "expenses:edit", "expenses:delete",
        "inventory:view", "inventory:create", "inventory:edit", "inventory:delete",
        "suppliers:view", "suppliers:create", "suppliers:edit",
        "laboratory:view", "laboratory:create", "laboratory:edit",
        "staff:view", "staff:create", "staff:edit",
        "dentists:view", "dentists:create", "dentists:edit",
        "roles:view", "roles:create", "roles:edit",
        "reports:view", "reports:export",
        "settings:view", "clinic:manage",
        "notifications:view", "audit:view",
      ],
    },
    CLINIC_OWNER: {
      name: "Clinic Owner",
      nameAr: "مالك العيادة",
      permissions: [
        "dashboard:view", "patients:view", "patients:create", "patients:edit", "patients:export", "patients:print",
        "appointments:view", "appointments:create", "appointments:edit", "appointments:print",
        "waitingRoom:view", "waitingRoom:create", "waitingRoom:edit",
        "clinical:view", "clinical:create", "clinical:edit",
        "dentalChart:view", "dentalChart:create", "dentalChart:edit",
        "diagnoses:view", "diagnoses:create", "diagnoses:edit",
        "treatmentPlans:view", "treatmentPlans:create", "treatmentPlans:edit", "treatmentPlans:approve",
        "prescriptions:view", "prescriptions:create", "prescriptions:print",
        "imaging:view", "imaging:create",
        "docs:view", "docs:create",
        "consents:view", "consents:create", "consents:print",
        "invoices:view", "invoices:create", "invoices:edit", "invoices:print", "invoices:refund", "invoices:delete",
        "payments:view", "payments:create", "payments:refund",
        "installments:view", "installments:create", "installments:edit",
        "expenses:view", "expenses:create", "expenses:edit", "expenses:delete",
        "inventory:view", "inventory:create", "inventory:edit",
        "suppliers:view", "suppliers:create", "suppliers:edit",
        "laboratory:view", "laboratory:create", "laboratory:edit",
        "staff:view", "staff:create", "staff:edit",
        "dentists:view", "dentists:create", "dentists:edit",
        "roles:view", "roles:edit",
        "reports:view", "reports:export",
        "settings:view", "clinic:manage",
        "notifications:view", "audit:view",
      ],
    },
    BRANCH_MANAGER: {
      name: "Branch Manager",
      nameAr: "مدير فرع",
      permissions: [
        "dashboard:view", "patients:view", "patients:create", "patients:edit",
        "appointments:view", "appointments:create", "appointments:edit",
        "waitingRoom:view", "waitingRoom:create", "waitingRoom:edit",
        "clinical:view", "clinical:create",
        "dentalChart:view", "dentalChart:create", "dentalChart:edit",
        "diagnoses:view", "diagnoses:create", "diagnoses:edit",
        "treatmentPlans:view", "treatmentPlans:create", "treatmentPlans:edit",
        "prescriptions:view", "prescriptions:print",
        "imaging:view", "imaging:create",
        "docs:view", "docs:create",
        "consents:view", "consents:create",
        "invoices:view", "invoices:create", "invoices:edit", "invoices:print",
        "payments:view", "payments:create",
        "expenses:view", "expenses:create", "expenses:edit",
        "inventory:view", "inventory:create", "inventory:edit",
        "reports:view", "reports:export",
        "notifications:view",
      ],
    },
    DENTIST: {
      name: "Dentist",
      nameAr: "طبيب أسنان",
      permissions: [
        "dashboard:view", "patients:view", "patients:create", "patients:edit",
        "appointments:view", "appointments:create", "appointments:edit",
        "waitingRoom:view", "waitingRoom:create", "waitingRoom:edit",
        "clinical:view", "clinical:create", "clinical:edit",
        "dentalChart:view", "dentalChart:create", "dentalChart:edit",
        "diagnoses:view", "diagnoses:create", "diagnoses:edit",
        "treatmentPlans:view", "treatmentPlans:create", "treatmentPlans:edit",
        "prescriptions:view", "prescriptions:create", "prescriptions:print",
        "imaging:view", "imaging:create",
        "docs:view", "docs:create",
        "consents:view", "consents:create", "consents:print",
        "invoices:view", "invoices:create", "invoices:print",
        "payments:view",
        "laboratory:view", "laboratory:create", "laboratory:edit",
        "reports:view", "notifications:view",
      ],
    },
    DENTAL_ASSISTANT: {
      name: "Dental Assistant",
      nameAr: "مساعد طبيب أسنان",
      permissions: [
        "dashboard:view", "patients:view", "patients:create", "patients:edit",
        "appointments:view", "appointments:create", "appointments:edit",
        "waitingRoom:view", "waitingRoom:create", "waitingRoom:edit",
        "clinical:view", "clinical:create",
        "dentalChart:view", "dentalChart:create",
        "diagnoses:view", "treatmentPlans:view",
        "imaging:view", "imaging:create",
        "docs:view", "docs:create",
        "consents:view", "consents:create",
        "invoices:view", "invoices:create", "invoices:print",
        "notifications:view",
      ],
    },
    RECEPTIONIST: {
      name: "Receptionist",
      nameAr: "الاستقبال",
      permissions: [
        "dashboard:view", "patients:view", "patients:create", "patients:edit", "patients:export", "patients:print",
        "appointments:view", "appointments:create", "appointments:edit", "appointments:delete", "appointments:export", "appointments:print",
        "waitingRoom:view", "waitingRoom:create", "waitingRoom:edit",
        "clinical:view", "dentalChart:view", "diagnoses:view", "treatmentPlans:view",
        "prescriptions:view", "prescriptions:print",
        "imaging:view", "docs:view", "docs:create",
        "consents:view", "consents:create", "consents:print",
        "invoices:view", "invoices:create", "invoices:print",
        "payments:view", "payments:create",
        "installments:view", "notifications:view",
      ],
    },
    ACCOUNTANT: {
      name: "Accountant",
      nameAr: "محاسب",
      permissions: [
        "dashboard:view", "patients:view", "appointments:view",
        "invoices:view", "invoices:create", "invoices:edit", "invoices:print", "invoices:refund", "invoices:delete",
        "payments:view", "payments:create", "payments:refund",
        "installments:view", "installments:create", "installments:edit",
        "expenses:view", "expenses:create", "expenses:edit", "expenses:delete",
        "reports:view", "reports:export", "notifications:view",
      ],
    },
    LAB_TECHNICIAN: {
      name: "Lab Technician",
      nameAr: "فني مختبر",
      permissions: ["dashboard:view", "patients:view", "laboratory:view", "laboratory:create", "laboratory:edit", "imaging:view", "notifications:view"],
    },
    PHARMACIST: {
      name: "Pharmacist",
      nameAr: "صيدلي",
      permissions: [
        "dashboard:view", "patients:view",
        "prescriptions:view", "prescriptions:create", "prescriptions:print",
        "inventory:view", "inventory:create", "inventory:edit", "inventory:delete",
        "suppliers:view", "suppliers:create", "suppliers:edit",
        "notifications:view",
      ],
    },
    INVENTORY_MANAGER: {
      name: "Inventory Manager",
      nameAr: "مدير المخزون",
      permissions: ["dashboard:view", "inventory:view", "inventory:create", "inventory:edit", "inventory:delete", "suppliers:view", "suppliers:create", "suppliers:edit", "reports:view", "notifications:view"],
    },
  }

  const roleRecords: Record<string, string> = {}
  for (const [key, def] of Object.entries(roles)) {
    const r = await prisma.role.create({ data: { key, name: def.name, nameAr: def.nameAr, permissions: def.permissions, isSystem: true } })
    roleRecords[key] = r.id
  }

  // ---------- Staff / Users ----------
  const adminPasswordHash = await hash(ADMIN_PASSWORD, 10)

  const admin = await prisma.user.create({
    data: {
      name: "System Administrator",
      nameAr: "مدير النظام",
      username: "admin",
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      roleId: roleRecords.SUPER_ADMIN,
      branchId: mainBranch.id,
      isActive: true,
    },
  })

  const owner = await prisma.user.create({
    data: {
      name: "Ahmed Al-Yemeni",
      nameAr: "أحمد اليمني",
      username: "owner",
      email: "owner@doralasnan.ye",
      passwordHash: await hash("Owner@12345", 10),
      roleId: roleRecords.CLINIC_OWNER,
      branchId: mainBranch.id,
    },
  })

  // Dentists (users + dentist profiles)
  const dentistDefs = [
    {
      name: "Dr. Yasmin Al-Hadrami",
      nameAr: "د. ياسمين الحضرمية",
      email: "dr.yasmin@doralasnan.ye",
      specialty: "ORTHODONTICS",
      license: "YMD-1042",
      days: ["SAT", "SUN", "MON", "TUE", "WED"],
    },
    {
      name: "Dr. Tariq Al-Absi",
      nameAr: "د. طارق العبسي",
      email: "dr.tariq@doralasnan.ye",
      specialty: "ENDODONTICS",
      license: "YMD-1120",
      days: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
    },
    {
      name: "Dr. Salma Al-Sayaghi",
      nameAr: "د. سلمى السياغي",
      email: "dr.salma@doralasnan.ye",
      specialty: "GENERAL",
      license: "YMD-0871",
      days: ["SAT", "MON", "WED", "THU"],
    },
    {
      name: "Dr. Omar Ba-Saleh",
      nameAr: "د. عمر باعشة",
      email: "dr.omar@doralasnan.ye",
      specialty: "ORAL_SURGERY",
      license: "YMD-1355",
      days: ["SUN", "TUE", "THU"],
    },
  ]

  const dentistUsers: { id: string; dentistId: string; nameAr: string }[] = []
  for (const d of dentistDefs) {
    const u = await prisma.user.create({
      data: {
        name: d.name,
        nameAr: d.nameAr,
        username: d.email.split("@")[0],
        email: d.email,
        passwordHash: await hash("Dentist@12345", 10),
        roleId: roleRecords.DENTIST,
        branchId: mainBranch.id,
        isDentist: true,
      },
    })
    const dent = await prisma.dentist.create({
      data: {
        userId: u.id,
        branchId: mainBranch.id,
        specialty: d.specialty,
        licenseNumber: d.license,
        workingDays: d.days,
        workingHours: { start: "09:00", end: "17:00" },
      },
    })
    dentistUsers.push({ id: u.id, dentistId: dent.id, nameAr: d.nameAr })
  }

  const receptionist = await prisma.user.create({
    data: {
      name: "Fatima Saeed",
      nameAr: "فاطمة سعيد",
      username: "reception",
      email: "reception@doralasnan.ye",
      passwordHash: await hash("Reception@12345", 10),
      roleId: roleRecords.RECEPTIONIST,
      branchId: mainBranch.id,
    },
  })
  const accountant = await prisma.user.create({
    data: {
      name: "Khaled Nasser",
      nameAr: "خالد ناصر",
      username: "accountant",
      email: "accountant@doralasnan.ye",
      passwordHash: await hash("Accountant@12345", 10),
      roleId: roleRecords.ACCOUNTANT,
      branchId: mainBranch.id,
    },
  })

  // Demo user with full admin access
  await prisma.user.create({
    data: {
      name: "Demo User",
      nameAr: "مستخدم تجريبي",
      username: "demo",
      email: "demo@demo.com",
      passwordHash: await hash("demo123", 10),
      roleId: roleRecords.SUPER_ADMIN,
      branchId: mainBranch.id,
    },
  })

  // ---------- Rooms & Chairs ----------
  const room1 = await prisma.room.create({ data: { branchId: mainBranch.id, name: "Unit 1", nameAr: "وحدة 1" } })
  const room2 = await prisma.room.create({ data: { branchId: mainBranch.id, name: "Unit 2", nameAr: "وحدة 2" } })
  const room3 = await prisma.room.create({ data: { branchId: mainBranch.id, name: "Surgery Room", nameAr: "غرفة الجراحة" } })

  const chairs = [
    { name: "Chair A1", nameAr: "كرسي A1", roomId: room1.id },
    { name: "Chair A2", nameAr: "كرسي A2", roomId: room1.id },
    { name: "Chair B1", nameAr: "كرسي B1", roomId: room2.id },
    { name: "Chair B2", nameAr: "كرسي B2", roomId: room2.id },
    { name: "Chair S1", nameAr: "كرسي S1", roomId: room3.id },
  ]
  const chairRecords = []
  for (const c of chairs) {
    chairRecords.push(await prisma.chair.create({ data: { branchId: mainBranch.id, name: c.name, nameAr: c.nameAr, roomId: c.roomId } }))
  }

  // ---------- Services / Procedures ----------
  const procedures = [
    { code: "EXAM", nameEn: "Examination", nameAr: "فحص سريري", cat: "Diagnostic", dur: 15, price: 5000, cost: 1000, tax: 5 },
    { code: "CONS", nameEn: "Consultation", nameAr: "استشارة", cat: "Diagnostic", dur: 15, price: 5000, cost: 1000, tax: 5 },
    { code: "CLN", nameEn: "Cleaning & Scaling", nameAr: "تنظيف وإزالة الجير", cat: "Preventive", dur: 30, price: 15000, cost: 4000, tax: 5 },
    { code: "POL", nameEn: "Polishing", nameAr: "تلميع", cat: "Preventive", dur: 15, price: 6000, cost: 1500, tax: 5 },
    { code: "FLU", nameEn: "Fluoride", nameAr: "فلوريد", cat: "Preventive", dur: 15, price: 7000, cost: 2000, tax: 5 },
    { code: "SEAL", nameEn: "Sealant", nameAr: "مانع تسرب", cat: "Preventive", dur: 20, price: 10000, cost: 3000, tax: 5 },
    { code: "FIL-COMP", nameEn: "Composite Filling", nameAr: "حشوة تجميلية", cat: "Restorative", dur: 30, price: 20000, cost: 8000, tax: 5 },
    { code: "FIL-GIC", nameEn: "GIC Filling", nameAr: "حشوة أسمنت زجاجي", cat: "Restorative", dur: 20, price: 12000, cost: 4500, tax: 5 },
    { code: "RCT", nameEn: "Root Canal (Anterior)", nameAr: "علاج عصب أمامي", cat: "Endodontics", dur: 60, price: 35000, cost: 12000, tax: 5 },
    { code: "RCT-MOLAR", nameEn: "Root Canal (Molar)", nameAr: "علاج عصب طاحن", cat: "Endodontics", dur: 90, price: 60000, cost: 20000, tax: 5 },
    { code: "EXT", nameEn: "Simple Extraction", nameAr: "خلع بسيط", cat: "Surgery", dur: 30, price: 10000, cost: 3000, tax: 5 },
    { code: "EXT-SURG", nameEn: "Surgical Extraction", nameAr: "خلع جراحي", cat: "Surgery", dur: 60, price: 25000, cost: 9000, tax: 5 },
    { code: "CRN-PFM", nameEn: "PFM Crown", nameAr: "تاج معدن خزفي", cat: "Prosthodontics", dur: 60, price: 80000, cost: 35000, tax: 5 },
    { code: "CRN-ZIR", nameEn: "Zirconia Crown", nameAr: "تاج زيركون", cat: "Prosthodontics", dur: 60, price: 120000, cost: 55000, tax: 5 },
    { code: "BRDGE", nameEn: "Bridge Unit", nameAr: "جسر سني", cat: "Prosthodontics", dur: 60, price: 90000, cost: 40000, tax: 5 },
    { code: "VEN", nameEn: "Veneer", nameAr: "قشرة تجميلية", cat: "Cosmetic", dur: 60, price: 95000, cost: 40000, tax: 5 },
    { code: "IMP", nameEn: "Implant Unit", nameAr: "زراعة سن", cat: "Implantology", dur: 90, price: 250000, cost: 120000, tax: 5 },
    { code: "WHIT", nameEn: "Teeth Whitening", nameAr: "تبييض الأسنان", cat: "Cosmetic", dur: 60, price: 70000, cost: 25000, tax: 5 },
    { code: "ORT-BRA", nameEn: "Braces (Full Arch)", nameAr: "تقويم معدني", cat: "Orthodontics", dur: 60, price: 400000, cost: 200000, tax: 5 },
    { code: "ORT-RET", nameEn: "Retainer", nameAr: "مثبت تقويم", cat: "Orthodontics", dur: 30, price: 30000, cost: 10000, tax: 5 },
    { code: "DENT-FULL", nameEn: "Full Denture", nameAr: "طقم أسنان كامل", cat: "Prosthodontics", dur: 90, price: 200000, cost: 90000, tax: 5 },
    { code: "EMER", nameEn: "Emergency Treatment", nameAr: "علاج طارئ", cat: "Other", dur: 30, price: 8000, cost: 2500, tax: 5 },
  ]
  const procedureRecords: Record<string, string> = {}
  for (const p of procedures) {
    const rec = await prisma.procedure.create({
      data: {
        code: p.code, nameEn: p.nameEn, nameAr: p.nameAr, category: p.cat,
        durationMinutes: p.dur, price: p.price, cost: p.cost, taxRate: p.tax,
      },
    })
    procedureRecords[p.code] = rec.id
  }

  // ---------- Medications ----------
  const medications = [
    { name: "Amoxicillin 500mg", genericName: "Amoxicillin", brandName: "Amoxil", strength: "500mg", form: "Capsule", manufacturer: "GSK", activeIngredient: "Amoxicillin trihydrate", instructionsEn: "One capsule every 8 hours.", instructionsAr: "كبسولة واحدة كل 8 ساعات." },
    { name: "Metronidazole 500mg", genericName: "Metronidazole", brandName: "Flagyl", strength: "500mg", form: "Tablet", manufacturer: "Sanofi", activeIngredient: "Metronidazole", instructionsEn: "One tablet every 8 hours after meals.", instructionsAr: "قرص واحد كل 8 ساعات بعد الأكل." },
    { name: "Ibuprofen 400mg", genericName: "Ibuprofen", brandName: "Brufen", strength: "400mg", form: "Tablet", manufacturer: "Abbott", activeIngredient: "Ibuprofen", instructionsEn: "One tablet every 6-8 hours as needed.", instructionsAr: "قرص واحد كل 6-8 ساعات عند الحاجة." },
    { name: "Paracetamol 500mg", genericName: "Paracetamol", brandName: "Panadol", strength: "500mg", form: "Tablet", manufacturer: "GSK", activeIngredient: "Paracetamol", instructionsEn: "One to two tablets every 6 hours.", instructionsAr: "قرص إلى قرصين كل 6 ساعات." },
    { name: "Chlorhexidine 0.12%", genericName: "Chlorhexidine gluconate", brandName: "Oradent", strength: "0.12%", form: "Mouthwash", manufacturer: "Local", activeIngredient: "Chlorhexidine", instructionsEn: "Rinse twice daily after brushing.", instructionsAr: "مضمضة مرتين يومياً بعد تنظيف الأسنان." },
    { name: "Lidocaine 2%", genericName: "Lidocaine HCl + Epinephrine", brandName: "Xylocaine", strength: "2%", form: "Injection", manufacturer: "AstraZeneca", activeIngredient: "Lidocaine", instructionsEn: "Administered by the dentist only.", instructionsAr: "يستخدم من قبل الطبيب فقط." },
    { name: "Dexamethasone 0.5mg", genericName: "Dexamethasone", brandName: "Decadron", strength: "0.5mg", form: "Tablet", manufacturer: "Organon", activeIngredient: "Dexamethasone", instructionsEn: "As prescribed by the dentist.", instructionsAr: "حسب إرشادات الطبيب." },
    { name: "Fluoride gel 1.1%", genericName: "Sodium fluoride", brandName: "Fluoridex", strength: "1.1%", form: "Gel", manufacturer: "Discus", activeIngredient: "Sodium fluoride", instructionsEn: "Apply once a day for 1 minute.", instructionsAr: "يوضع مرة يومياً لمدة دقيقة واحدة." },
  ]
  for (const m of medications) {
    await prisma.medication.create({ data: m })
  }

  // ---------- Suppliers ----------
  const suppliers = [
    { name: "Yemen Dental Supply", nameAr: "يمن ديستال للتوريدات", phone: "+967 1 222 345", governorate: "Sana'a", city: "Sana'a" },
    { name: "Al-Alfi Medical", nameAr: "الفلقي الطبية", phone: "+967 2 322 444", governorate: "Aden", city: "Aden" },
    { name: "Hikma Trading", nameAr: "حكمة التجارية", phone: "+967 7 733 555 120", governorate: "Taiz", city: "Taiz" },
  ]
  const supplierRecords = []
  for (const s of suppliers) {
    supplierRecords.push(await prisma.supplier.create({ data: s }))
  }

  // ---------- Inventory ----------
  const products = [
    { name: "Composite Resin A2", nameAr: "مادة حشو تجميلية A2", sku: "MAT-001", cat: "Restorative", qty: 42, minStock: 10, cost: 8000, price: 15000, unit: "syringe", supplierId: supplierRecords[0].id, batch: "B2024-118", exp: addDays(300) },
    { name: "Dental Floss", nameAr: "خيط تنظيف", sku: "SUP-002", cat: "Patient", qty: 100, minStock: 20, cost: 500, price: 1000, unit: "box", supplierId: supplierRecords[1].id, batch: "B2024-220", exp: addDays(600) },
    { name: "Anesthetic Cartridge", nameAr: "إبرة تخدير", sku: "MAT-014", cat: "Anesthesia", qty: 8, minStock: 25, cost: 1500, price: 3000, unit: "box", supplierId: supplierRecords[0].id, batch: "B2025-044", exp: addDays(90) },
    { name: "Surgical Gloves", nameAr: "قفازات جراحية", sku: "SUP-010", cat: "Consumables", qty: 60, minStock: 30, cost: 900, price: 2000, unit: "box", supplierId: supplierRecords[2].id, batch: "B2024-331", exp: addDays(400) },
    { name: "X-Ray Film", nameAr: "أفلام أشعة", sku: "IMG-001", cat: "Imaging", qty: 15, minStock: 20, cost: 2500, price: 5000, unit: "pack", supplierId: supplierRecords[1].id, batch: "B2023-990", exp: addDays(60) },
    { name: "Alginate Powder", nameAr: "بودرة ألجانات", sku: "PRO-002", cat: "Prosthetics", qty: 24, minStock: 8, cost: 4000, price: 8000, unit: "bag", supplierId: supplierRecords[0].id, batch: "B2025-010", exp: addDays(500) },
  ]
  const productRecords = []
  for (const p of products) {
    productRecords.push(await prisma.product.create({
      data: {
        branchId: mainBranch.id, name: p.name, nameAr: p.nameAr, sku: p.sku, category: p.cat,
        quantity: p.qty, minStock: p.minStock, cost: p.cost, sellingPrice: p.price,
        unit: p.unit, supplierId: p.supplierId, batch: p.batch, expirationDate: p.exp,
      },
    }))
  }

  // ---------- Patients ----------
  const patientDefs = [
    { no: "P-0001", fn: "Mohammed", ln: "Al-Amri", ar: "محمد العمري", g: "MALE", dob: new Date("1985-03-12"), phone: "+967 777 123 456", gov: "Sana'a", city: "Sana'a", nat: "1832012345", em: "Ali Al-Amri", emr: "Brother", emp: "+967 777 123 450" },
    { no: "P-0002", fn: "Fatima", ln: "Al-Qurashi", ar: "فاطمة القرشي", g: "FEMALE", dob: new Date("1992-07-22"), phone: "+967 733 456 789", gov: "Sana'a", city: "Sana'a", nat: "1832021678" },
    { no: "P-0003", fn: "Abdullah", ln: "Bawazir", ar: "عبدالله باوزير", g: "MALE", dob: new Date("1978-01-05"), phone: "+967 771 222 333", gov: "Hadhramaut", city: "Mukalla", nat: "1903056789", em: "Salem Bawazir", emr: "Friend", emp: "+967 771 222 330" },
    { no: "P-0004", fn: "Aisha", ln: "Al-Shaibani", ar: "عائشة الشيباني", g: "FEMALE", dob: new Date("1999-10-30"), phone: "+967 733 987 654", gov: "Taiz", city: "Taiz", nat: "1421114567" },
    { no: "P-0005", fn: "Saleh", ln: "Al-Mikhlafi", ar: "صالح المخلافي", g: "MALE", dob: new Date("1965-12-08"), phone: "+967 710 111 222", gov: "Ibb", city: "Ibb", nat: "1503123456", em: "Hani Al-Mikhlafi", emr: "Son", emp: "+967 710 111 220" },
    { no: "P-0006", fn: "Huda", ln: "Salem", ar: "هدى سالم", g: "FEMALE", dob: new Date("2003-05-19"), phone: "+967 733 555 666", gov: "Aden", city: "Aden", nat: "0904031627" },
    { no: "P-0007", fn: "Yousef", ln: "Al-Haddad", ar: "يوسف الحداد", g: "MALE", dob: new Date("2015-02-11"), phone: "+967 770 888 777", gov: "Sana'a", city: "Sana'a", nat: "1103028392" },
    { no: "P-0008", fn: "Mariam", ln: "Al-Awlaqi", ar: "مريم العولقي", g: "FEMALE", dob: new Date("1988-09-25"), phone: "+967 771 444 555", gov: "Shabwah", city: "Ataq", nat: "1702048891" },
    { no: "P-0009", fn: "Khalid", ln: "Al-Subaihi", ar: "خالد السبيعي", g: "MALE", dob: new Date("1990-04-14"), phone: "+967 700 333 444", gov: "Al Hudaydah", city: "Hudaydah", nat: "0551027321" },
    { no: "P-0010", fn: "Noor", ln: "Al-Junaid", ar: "نور الجنيد", g: "FEMALE", dob: new Date("2000-08-02"), phone: "+967 733 111 999", gov: "Sana'a", city: "Sana'a", nat: "1833019454" },
    { no: "P-0011", fn: "Jamal", ln: "Al-Shami", ar: "جمال الشامي", g: "MALE", dob: new Date("1972-06-30"), phone: "+967 771 777 888", gov: "Dhamar", city: "Dhamar", nat: "1604026178" },
    { no: "P-0012", fn: "Laila", ln: "Mubarak", ar: "ليلى مبارك", g: "FEMALE", dob: new Date("1995-11-17"), phone: "+967 733 222 111", gov: "Aden", city: "Aden", nat: "0905071234" },
    { no: "P-0013", fn: "Hassan", ln: "Al-Washali", ar: "حسن الوشلي", g: "MALE", dob: new Date("1982-02-28"), phone: "+967 770 999 000", gov: "Sana'a", city: "Sana'a", nat: "1831017822" },
    { no: "P-0014", fn: "Rasha", ln: "Al-Eryani", ar: "رشا الإرياني", g: "FEMALE", dob: new Date("1987-07-09"), phone: "+967 733 888 444", gov: "Ibb", city: "Ibb", nat: "1505019245" },
    { no: "P-0015", fn: "Nabil", ln: "Al-Khamis", ar: "نبيل الخميسي", g: "MALE", dob: new Date("1998-12-01"), phone: "+967 712 444 222", gov: "Sana'a", city: "Sana'a", nat: "1832015411" },
  ]

  const patientRecords = []
  for (const p of patientDefs) {
    const rec = await prisma.patient.create({
      data: {
        clinicId: clinic.id, branchId: mainBranch.id, patientNo: p.no,
        firstName: p.fn, middleName: null, lastName: p.ln, pyerNameAr: p.ar,
        gender: p.g as "MALE" | "FEMALE", dateOfBirth: p.dob, nationality: "Yemeni",
        nationalId: p.nat, phone: p.phone, governorate: p.gov, city: p.city,
        emergencyContactName: p.em, emergencyContactRelation: p.emr, emergencyContactPhone: p.emp,
      },
    })
    patientRecords.push(rec)
  }

  // Medical histories for first few
  await prisma.medicalHistory.create({
    data: { patientId: patientRecords[0].id, diabetes: true, allergies: ["Penicillin"], currentMedications: "Metformin" },
  })
  await prisma.medicalHistory.create({
    data: { patientId: patientRecords[4].id, hypertension: true, heartDisease: false, allergies: [], notes: "Old patient, careful with epinephrine" },
  })
  await prisma.medicalHistory.create({
    data: { patientId: patientRecords[7].id, pregnancy: true },
  })

  // Dental histories
  await prisma.dentalHistory.create({
    data: { patientId: patientRecords[0].id, previousTreatment: "Cleaning, 2 fillings", oralHygiene: "Good", lastDentalVisit: addDays(-180) },
  })
  await prisma.dentalHistory.create({
    data: { patientId: patientRecords[1].id, previousTreatment: "Root canal tooth 36", previousComplications: "None", lastDentalVisit: addDays(-90) },
  })
  await prisma.dentalHistory.create({
    data: { patientId: patientRecords[6].id, previousTreatment: "Fluoride", orthodonticHistory: "None", lastDentalVisit: addDays(-30) },
  })

  // Tooth records + conditions for a couple of patients
  const toothConditionsForPatient = async (patientId: string, records: { tooth: number; cond: string; surfaces?: string[]; severity?: string; dentition?: string }[]) => {
    for (const r of records) {
      const tr = await prisma.toothRecord.upsert({
        where: { patientId_toothNumber_dentition: { patientId, toothNumber: r.tooth, dentition: (r.dentition as "ADULT" | "PRIMARY") ?? "ADULT" } },
        create: { patientId, toothNumber: r.tooth, dentition: (r.dentition as "ADULT" | "PRIMARY") ?? "ADULT" },
        update: {},
      })
      await prisma.toothCondition.create({
        data: {
          toothRecordId: tr.id, condition: r.cond as never, surfaces: (r.surfaces as never[] | undefined) ?? [],
          severity: r.severity as never, dentistId: dentistUsers[0].dentistId, date: randomDaysAgo(),
        },
      })
    }
  }

  await toothConditionsForPatient(patientRecords[0].id, [
    { tooth: 36, cond: "DEEP_CARIES", surfaces: ["OCCLUSAL"], severity: "SEVERE" },
    { tooth: 36, cond: "ROOT_CANAL_NEEDED", severity: "SEVERE" },
    { tooth: 16, cond: "FILLING", surfaces: ["OCCLUSAL"], severity: "MILD" },
    { tooth: 11, cond: "FRACTURE", surfaces: ["INCISAL"], severity: "MODERATE" },
    { tooth: 48, cond: "IMPACTED", severity: "MILD" },
    { tooth: 17, cond: "HEALTHY" },
    { tooth: 46, cond: "CARIES", surfaces: ["BUCCAL"], severity: "MODERATE" },
  ])

  await toothConditionsForPatient(patientRecords[4].id, [
    { tooth: 26, cond: "ROOT_CANAL", surfaces: ["OCCLUSAL"], severity: "MILD" },
    { tooth: 26, cond: "CROWN", severity: "MILD" },
    { tooth: 21, cond: "MISSING" },
    { tooth: 36, cond: "FILLING", surfaces: ["OCCLUSAL"], severity: "MILD" },
    { tooth: 47, cond: "ABSCESS", severity: "CRITICAL" },
  ])

  await toothConditionsForPatient(patientRecords[9].id, [
    { tooth: 41, cond: "DISCOLORATION", severity: "MODERATE" },
    { tooth: 42, cond: "VENEER", severity: "MILD" },
    { tooth: 15, cond: "CARIES", surfaces: ["MESIAL"], severity: "MILD" },
  ])

  await toothConditionsForPatient(patientRecords[12].id, [
    { tooth: 37, cond: "CARIES", surfaces: ["OCCLUSAL"], severity: "MODERATE" },
    { tooth: 38, cond: "EXTRACTED" },
  ])

  // Child patient primary dentition
  await toothConditionsForPatient(patientRecords[6].id, [
    { tooth: 55, cond: "CARIES", surfaces: ["OCCLUSAL"], severity: "MODERATE", dentition: "PRIMARY" },
    { tooth: 64, cond: "FILLING", surfaces: ["OCCLUSAL"], severity: "MILD", dentition: "PRIMARY" },
    { tooth: 51, cond: "WEAR", surfaces: ["INCISAL"], severity: "MILD", dentition: "PRIMARY" },
  ])

  // ---------- Appointments (today + next days) ----------
  const appointmentSlots = [
    { pat: 0, dent: dentistUsers[1], day: 0, start: "09:00", end: "09:45", type: "ROOT_CANAL", status: "SCHEDULED", notes: "Continue RCT tooth 36" },
    { pat: 1, dent: dentistUsers[0], day: 0, start: "09:30", end: "10:00", type: "CONSULTATION", status: "CONFIRMED" },
    { pat: 2, dent: dentistUsers[3], day: 0, start: "11:00", end: "11:40", type: "EXTRACTION", status: "SCHEDULED", notes: "Wisdom tooth consult" },
    { pat: 3, dent: dentistUsers[2], day: 0, start: "10:00", end: "10:30", type: "CLEANING", status: "SCHEDULED" },
    { pat: 4, dent: dentistUsers[1], day: 1, start: "10:00", end: "10:45", type: "EMERGENCY", status: "CONFIRMED", notes: "Pain in 47" },
    { pat: 5, dent: dentistUsers[0], day: 1, start: "12:00", end: "12:40", type: "EXAMINATION", status: "SCHEDULED" },
    { pat: 6, dent: dentistUsers[2], day: 0, start: "13:00", end: "13:30", type: "FOLLOW_UP", status: "CHECKED_IN", notes: "Child check" },
    { pat: 7, dent: dentistUsers[3], day: 2, start: "09:30", end: "10:30", type: "CROWN", status: "SCHEDULED" },
    { pat: 8, dent: dentistUsers[1], day: 1, start: "14:00", end: "14:30", type: "FILLING", status: "CONFIRMED" },
    { pat: 9, dent: dentistUsers[0], day: 2, start: "11:00", end: "11:45", type: "CROWN", status: "SCHEDULED", notes: "Veneer for 42" },
    { pat: 10, dent: dentistUsers[2], day: 3, start: "09:00", end: "09:40", type: "EXAMINATION", status: "SCHEDULED" },
    { pat: 11, dent: dentistUsers[1], day: 3, start: "10:30", end: "11:15", type: "ROOT_CANAL", status: "CONFIRMED" },
    { pat: 12, dent: dentistUsers[2], day: 4, start: "12:00", end: "12:30", type: "FILLING", status: "SCHEDULED" },
    { pat: 13, dent: dentistUsers[0], day: 2, start: "13:30", end: "14:00", type: "CLEANING", status: "SCHEDULED" },
    { pat: 14, dent: dentistUsers[3], day: 5, start: "09:00", end: "09:30", type: "FOLLOW_UP", status: "SCHEDULED" },
    { pat: 2, dent: dentistUsers[2], day: -3, start: "09:00", end: "09:30", type: "EXAMINATION", status: "COMPLETED" },
    { pat: 4, dent: dentistUsers[3], day: -5, start: "10:00", end: "10:30", type: "CLEANING", status: "COMPLETED" },
    { pat: 8, dent: dentistUsers[1], day: -2, start: "11:00", end: "11:30", type: "FOLLOW_UP", status: "NO_SHOW" },
    { pat: 0, dent: dentistUsers[0], day: -4, start: "14:00", end: "14:40", type: "EXAMINATION", status: "CANCELLED" },
  ]

  const appointmentRecords = []
  for (let i = 0; i < appointmentSlots.length; i++) {
    const s = appointmentSlots[i]
    const date = addDays(s.day)
    date.setHours(9, 0, 0, 0)
    const rec = await prisma.appointment.create({
      data: {
        patientId: patientRecords[s.pat].id,
        dentistId: s.dent.dentistId,
        branchId: mainBranch.id,
        chairId: chairRecords[i % chairRecords.length].id,
        roomId: chairRecords[i % chairRecords.length].roomId,
        date,
        startTime: s.start,
        endTime: s.end,
        type: s.type as never,
        status: s.status as never,
        priority: "MILD",
        notes: s.notes,
      },
    })
    appointmentRecords.push(rec)
  }

  // ---------- Invoices & Payments ----------

  const invoiceSpecs: { pat: number; status: string; items: { code: string; qty: number }[]; paid: number; daysAgoNum: number; method?: string }[] = [
    { pat: 0, status: "PAID", items: [{ code: "EXAM", qty: 1 }, { code: "CLN", qty: 1 }], paid: 20000, daysAgoNum: 5, method: "CASH" },
    { pat: 1, status: "PAID", items: [{ code: "RCT", qty: 1 }], paid: 35000, daysAgoNum: 12, method: "CASH" },
    { pat: 2, status: "PARTIALLY_PAID", items: [{ code: "CRN-PFM", qty: 1 }], paid: 30000, daysAgoNum: 3, method: "CASH" },
    { pat: 3, status: "PAID", items: [{ code: "WHIT", qty: 1 }], paid: 70000, daysAgoNum: 2, method: "BANK_TRANSFER" },
    { pat: 4, status: "ISSUED", items: [{ code: "EXT-SURG", qty: 1 }], paid: 0, daysAgoNum: 1, method: "CASH" },
    { pat: 6, status: "PAID", items: [{ code: "FLU", qty: 1 }, { code: "SEAL", qty: 1 }], paid: 17000, daysAgoNum: 7, method: "CASH" },
    { pat: 8, status: "PARTIALLY_PAID", items: [{ code: "FIL-COMP", qty: 2 }], paid: 10000, daysAgoNum: 4, method: "MOBILE_WALLET" },
    { pat: 9, status: "PAID", items: [{ code: "VEN", qty: 1 }], paid: 95000, daysAgoNum: 8, method: "CASH" },
    { pat: 12, status: "ISSUED", items: [{ code: "FIL-GIC", qty: 1 }], paid: 0, daysAgoNum: 0, method: "CASH" },
    { pat: 14, status: "PAID", items: [{ code: "POL", qty: 1 }], paid: 6000, daysAgoNum: 10, method: "CARD" },
  ]

  let invoiceCounter = 1
  for (const spec of invoiceSpecs) {
    const procObjs = spec.items.map((it) => {
      const proc = procedures.find((p) => p.code === it.code)!
      return { proc, qty: it.qty }
    })
    const subtotal = procObjs.reduce((sum, x) => sum + Number(x.proc.price) * x.qty, 0)
    const tax = Math.round((subtotal * 5) / 100)
    const total = subtotal + tax
    const remaining = total - spec.paid
    const status = remaining <= 0 ? "PAID" : spec.paid > 0 ? "PARTIALLY_PAID" : "ISSUED"

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: `INV-${String(invoiceCounter++).padStart(5, "0")}`,
        patientId: patientRecords[spec.pat].id,
        branchId: mainBranch.id,
        status: status as never,
        issueDate: daysAgo(spec.daysAgoNum),
        subtotal,
        discount: 0,
        tax,
        total,
        paid: spec.paid,
        remaining,
        items: {
          create: procObjs.map((x) => ({
            procedureId: procedureRecords[x.proc.code],
            description: x.proc.nameEn,
            descriptionAr: x.proc.nameAr,
            quantity: x.qty,
            unitPrice: x.proc.price,
            taxRate: 5,
            total: Number(x.proc.price) * x.qty,
          })),
        },
      },
    })

    if (spec.paid > 0) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          patientId: patientRecords[spec.pat].id,
          branchId: mainBranch.id,
          amount: spec.paid,
          method: (spec.method ?? "CASH") as never,
          receivedById: accountant.id,
          paidAt: daysAgo(spec.daysAgoNum),
        },
      })
    }
  }

  // Payment plan with installments for the partially-paid crown patient
  const planPatient = patientRecords[2]
  const planInvoice = await prisma.invoice.findFirst({ where: { patientId: planPatient.id, status: "PARTIALLY_PAID" } })
  if (planInvoice) {
    const plan = await prisma.paymentPlan.create({
      data: {
        patientId: planPatient.id,
        branchId: mainBranch.id,
        invoiceId: planInvoice.id,
        totalAmount: planInvoice.total,
        downPayment: 30000,
        paidAmount: 30000,
        remainingAmount: Number(planInvoice.total) - 30000,
        notes: "Treatment installment plan",
      },
    })
    const remaining = Number(planInvoice.total) - 30000
    const per = Math.round(remaining / 2)
    const base = new Date()
    for (let i = 1; i <= 2; i++) {
      const due = new Date()
      due.setDate(base.getDate() + i * 30)
      await prisma.installment.create({
        data: { planId: plan.id, amount: per, dueDate: due, status: i === 1 ? "PENDING" : "PENDING", paidAt: null },
      })
    }
  }

  // ---------- Expenses ----------
  const expenses = [
    { cat: "RENT", amount: 250000, desc: "Monthly rent main branch", daysAgoNum: 1 },
    { cat: "SALARIES", amount: 600000, desc: "Staff salaries (month)", daysAgoNum: 3 },
    { cat: "UTILITIES", amount: 35000, desc: "Electricity + water", daysAgoNum: 2 },
    { cat: "DENTAL_MATERIALS", amount: 120000, desc: "Composite & anesthesia restock", daysAgoNum: 5 },
    { cat: "LABORATORY", amount: 90000, desc: "Lab cases payment", daysAgoNum: 6 },
    { cat: "MARKETING", amount: 45000, desc: "Social media campaign", daysAgoNum: 8 },
  ]
  for (const e of expenses) {
    await prisma.expense.create({
      data: {
        branchId: mainBranch.id,
        category: e.cat as never,
        amount: e.amount,
        description: e.desc,
        expenseDate: daysAgo(e.daysAgoNum),
        paidById: owner.id,
      },
    })
  }

  // ---------- Lab Cases ----------
  await prisma.labCase.create({
    data: {
      patientId: patientRecords[2].id,
      dentistId: dentistUsers[3].dentistId,
      branchId: mainBranch.id,
      toothNumbers: [16],
      restorationType: "PFM Crown",
      labName: "Modern Dental Lab",
      sentAt: daysAgo(4),
      expectedReturn: addDays(3),
      cost: 35000,
      status: "IN_PRODUCTION",
      notes: "Shade A2",
    },
  })
  await prisma.labCase.create({
    data: {
      patientId: patientRecords[7].id,
      dentistId: dentistUsers[3].dentistId,
      branchId: mainBranch.id,
      toothNumbers: [26],
      restorationType: "Zirconia Crown",
      labName: "Modern Dental Lab",
      sentAt: daysAgo(1),
      expectedReturn: addDays(6),
      cost: 55000,
      status: "SENT",
    },
  })

  // ---------- Notifications ----------
  await prisma.notification.createMany({
    data: [
      { userId: receptionist.id, type: "APPOINTMENT_UPCOMING", title: "Appointments today at 09:00", titleAr: "مواعيد اليوم الساعة 09:00", body: "4 appointments scheduled for today.", bodyAr: "4 مواعيد مجدولة اليوم.", link: "/appointments/today" },
      { userId: owner.id, type: "OUTSTANDING_PAYMENT", title: "Outstanding payments", titleAr: "دفعات مستحقة", body: "2 invoices have remaining balance.", bodyAr: "فاتورتان بمدفوعات متبقية.", link: "/billing/invoices" },
      { userId: accountant.id, type: "LOW_INVENTORY", title: "Low stock alert", titleAr: "تنبيه مخزون منخفض", body: "Anesthetic cartridge below min stock.", bodyAr: "إبر التخدير أقل من الحد الأدنى.", link: "/inventory" },
      { userId: receptionist.id, type: "LAB_CASE", title: "Lab case near due", titleAr: "حالة مختبر قرب الاستحقاق", body: "PFM crown expected in 3 days.", bodyAr: "تاج متوقع خلال 3 أيام.", link: "/laboratory" },
    ],
  })

  // ---------- Audit log ----------
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "CREATE",
      module: "Clinic",
      newValue: { name: clinic.name },
    },
  })

  console.log("✅ Seeding complete.")
  console.log("------------------------------------")
  console.log("Admin login:     ", ADMIN_EMAIL)
  console.log("Admin password:  ", ADMIN_PASSWORD)
  console.log("Owner login:     owner@doralasnan.ye / Owner@12345")
  console.log("Dentist login:   dr.yasmin@doralasnan.ye / Dentist@12345")
  console.log("Receptionist:    reception@doralasnan.ye / Reception@12345")
  console.log("------------------------------------")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })