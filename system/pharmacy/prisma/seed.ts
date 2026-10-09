import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.PGSCHEMA ?? "public" }
);
const prisma = new PrismaClient({ adapter });

const toMinor = (n: number) => BigInt(Math.round(n * 100));

async function main() {
  console.log("Seeding pharmacy database...");

  // Clean (dependency-safe order)
  await prisma.$transaction([
    prisma.salesReturnItem.deleteMany(),
    prisma.salesReturn.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.salesInvoiceItem.deleteMany(),
    prisma.salesInvoice.deleteMany(),
    prisma.supplierReturnItem.deleteMany(),
    prisma.supplierReturn.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.supplierPayment.deleteMany(),
    prisma.prescriptionItem.deleteMany(),
    prisma.prescription.deleteMany(),
    prisma.stockAdjustment.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.stockLevel.deleteMany(),
    prisma.medicineBatch.deleteMany(),
    prisma.medicine.deleteMany(),
    prisma.category.deleteMany(),
    prisma.manufacturer.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.doctor.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.expenseCategory.deleteMany(),
    prisma.cashMovement.deleteMany(),
    prisma.cashSession.deleteMany(),
    prisma.cashAccount.deleteMany(),
    prisma.posHold.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.numberSequence.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.user.deleteMany(),
    prisma.warehouse.deleteMany(),
    prisma.branch.deleteMany(),
  ], { maxWait: 10000, timeout: 120000 });

  // Branch + warehouse
  const branch = await prisma.branch.create({
    data: {
      nameAr: "الصيدلية الرئيسية - صنعاء",
      nameEn: "Main Branch - Sanaa",
      phone: "+967 1 234 567",
      address: "شارع الزبيري، صنعاء",
      isMain: true,
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      branchId: branch.id,
      nameAr: "المخزن الرئيسي",
      nameEn: "Main Warehouse",
      isMain: true,
    },
  });

  // Settings
  await prisma.setting.create({
    data: {
      key: "pharmacy",
      value: {
        nameAr: "صيدلية النور",
        nameEn: "Al-Noor Pharmacy",
        phone: "+967 1 234 567",
        email: "info@alnoor-pharmacy.ye",
        address: "شارع الزبيري، صنعاء، اليمن",
        taxNumber: "123456789",
        currency: "YER",
        taxRateBps: 0,
        lowStockThreshold: 10,
        expiryWarningDays: 60,
        footerNoteAr: "شكراً لزيارتكم - نتمنى لكم الشفاء العاجل",
      },
    },
  });

  // Users
  const password = await hash("demo123", 10);
  const users = [
    { username: "demo", name: "Ahmed Al-Sabri", nameAr: "أحمد الصبري", email: "owner@pharmacy.ye", role: "OWNER" },
    { username: "admin", name: "Mohammed Ali", nameAr: "محمد علي", email: "admin@pharmacy.ye", role: "ADMIN" },
    { username: "pharmacist", name: "Dr. Fatima Naji", nameAr: "د. فاطمة ناجي", email: "pharmacist@pharmacy.ye", role: "PHARMACIST" },
    { username: "cashier", name: "Sara Hussein", nameAr: "سارة حسين", email: "cashier@pharmacy.ye", role: "CASHIER" },
    { username: "inventory", name: "Khaled Omar", nameAr: "خالد عمر", email: "inventory@pharmacy.ye", role: "INVENTORY_MANAGER" },
    { username: "accountant", name: "Nadia Saleh", nameAr: "نادية صالح", email: "accountant@pharmacy.ye", role: "ACCOUNTANT" },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: { ...u, passwordHash: password, phone: "+967 7XX XXX XXX", branchId: branch.id },
    });
  }

  // Categories
  const categoryData = [
    { nameAr: "مسكنات وخوافض حرارة", nameEn: "Analgesics & Antipyretics" },
    { nameAr: "مضادات حيوية", nameEn: "Antibiotics" },
    { nameAr: "أدوية الجهاز الهضمي", nameEn: "Gastrointestinal" },
    { nameAr: "أدوية الضغط والقلب", nameEn: "Cardiovascular" },
    { nameAr: "أدوية السكري", nameEn: "Diabetes" },
    { nameAr: "فيتامينات ومكملات", nameEn: "Vitamins & Supplements" },
    { nameAr: "أدوية الجهاز التنفسي", nameEn: "Respiratory" },
    { nameAr: "مضادات الحساسية", nameEn: "Antihistamines" },
    { nameAr: "مستلزمات طبية", nameEn: "Medical Supplies" },
    { nameAr: "عناية بالبشرة", nameEn: "Skincare" },
  ];
  const categories = [];
  for (const c of categoryData) {
    categories.push(await prisma.category.create({ data: c }));
  }

  // Manufacturers
  const manufacturerData = [
    { nameAr: "شركة الأدوية اليمنية", nameEn: "Yemen Pharmaceutical Co.", country: "اليمن" },
    { nameAr: "سبأ للأدوية", nameEn: "Sheba Pharma", country: "اليمن" },
    { nameAr: "فايزر", nameEn: "Pfizer", country: "الولايات المتحدة" },
    { nameAr: "جلاكسو سميث كلاين", nameEn: "GSK", country: "المملكة المتحدة" },
    { nameAr: "نوفارتس", nameEn: "Novartis", country: "سويسرا" },
    { nameAr: "سانوفي", nameEn: "Sanofi", country: "فرنسا" },
    { nameAr: "جولف فارما", nameEn: "Gulf Pharma", country: "الإمارات" },
    { nameAr: "أمون للأدوية", nameEn: "Amoun Pharma", country: "مصر" },
  ];
  const manufacturers = [];
  for (const m of manufacturerData) {
    manufacturers.push(await prisma.manufacturer.create({ data: m }));
  }

  // Medicines
  const medicineData: Array<{
    nameAr: string;
    nameEn: string;
    genericName: string;
    strength: string;
    dosageForm: string;
    medicineType: string;
    purchase: number;
    sale: number;
    cat: number;
    mfr: number;
    rx?: boolean;
    unitsPerPack?: string;
  }> = [
    { nameAr: "بنادول 500 ملجم", nameEn: "Panadol 500mg", genericName: "Paracetamol", strength: "500mg", dosageForm: "tablet", medicineType: "otc", purchase: 150, sale: 250, cat: 0, mfr: 2 },
    { nameAr: "بروفين 400 ملجم", nameEn: "Brufen 400mg", genericName: "Ibuprofen", strength: "400mg", dosageForm: "tablet", medicineType: "otc", purchase: 200, sale: 350, cat: 0, mfr: 6 },
    { nameAr: "أموكسيسيلين 500 ملجم", nameEn: "Amoxicillin 500mg", genericName: "Amoxicillin", strength: "500mg", dosageForm: "capsule", medicineType: "rx", purchase: 400, sale: 700, cat: 1, mfr: 0, rx: true },
    { nameAr: "أزيثرومايسين 250 ملجم", nameEn: "Azithromycin 250mg", genericName: "Azithromycin", strength: "250mg", dosageForm: "tablet", medicineType: "rx", purchase: 900, sale: 1500, cat: 1, mfr: 4, rx: true },
    { nameAr: "أوميبرازول 20 ملجم", nameEn: "Omeprazole 20mg", genericName: "Omeprazole", strength: "20mg", dosageForm: "capsule", medicineType: "otc", purchase: 350, sale: 600, cat: 2, mfr: 5 },
    { nameAr: "موتيليوم 10 ملجم", nameEn: "Motilium 10mg", genericName: "Domperidone", strength: "10mg", dosageForm: "tablet", medicineType: "otc", purchase: 280, sale: 480, cat: 2, mfr: 5 },
    { nameAr: "كونكور 5 ملجم", nameEn: "Concor 5mg", genericName: "Bisoprolol", strength: "5mg", dosageForm: "tablet", medicineType: "rx", purchase: 650, sale: 1100, cat: 3, mfr: 4, rx: true },
    { nameAr: "لوسارتان 50 ملجم", nameEn: "Losartan 50mg", genericName: "Losartan", strength: "50mg", dosageForm: "tablet", medicineType: "rx", purchase: 500, sale: 850, cat: 3, mfr: 4, rx: true },
    { nameAr: "ميتفورمين 500 ملجم", nameEn: "Metformin 500mg", genericName: "Metformin", strength: "500mg", dosageForm: "tablet", medicineType: "rx", purchase: 250, sale: 450, cat: 4, mfr: 7, rx: true },
    { nameAr: "جليبنكلاميد 5 ملجم", nameEn: "Glibenclamide 5mg", genericName: "Glibenclamide", strength: "5mg", dosageForm: "tablet", medicineType: "rx", purchase: 200, sale: 380, cat: 4, mfr: 0, rx: true },
    { nameAr: "فيتامين سي 1000 ملجم", nameEn: "Vitamin C 1000mg", genericName: "Ascorbic Acid", strength: "1000mg", dosageForm: "tablet", medicineType: "otc", purchase: 300, sale: 550, cat: 5, mfr: 6 },
    { nameAr: "فيتامين د 50000 وحدة", nameEn: "Vitamin D 50000 IU", genericName: "Cholecalciferol", strength: "50000 IU", dosageForm: "capsule", medicineType: "otc", purchase: 600, sale: 1000, cat: 5, mfr: 6 },
    { nameAr: "حديد + فوليك أسيد", nameEn: "Iron + Folic Acid", genericName: "Ferrous Sulfate", strength: "65mg", dosageForm: "tablet", medicineType: "otc", purchase: 350, sale: 600, cat: 5, mfr: 0 },
    { nameAr: "فنتولين بخاخ", nameEn: "Ventolin Inhaler", genericName: "Salbutamol", strength: "100mcg", dosageForm: "inhaler", medicineType: "rx", purchase: 1200, sale: 2000, cat: 6, mfr: 3, rx: true },
    { nameAr: "كلاريتين 10 ملجم", nameEn: "Claritine 10mg", genericName: "Loratadine", strength: "10mg", dosageForm: "tablet", medicineType: "otc", purchase: 400, sale: 700, cat: 7, mfr: 4 },
    { nameAr: "زيرتك 10 ملجم", nameEn: "Zyrtec 10mg", genericName: "Cetirizine", strength: "10mg", dosageForm: "tablet", medicineType: "otc", purchase: 350, sale: 650, cat: 7, mfr: 3 },
    { nameAr: "شراب كحة - ديكستروميثورفان", nameEn: "Cough Syrup", genericName: "Dextromethorphan", strength: "15mg/5ml", dosageForm: "syrup", medicineType: "otc", purchase: 450, sale: 800, cat: 6, mfr: 0 },
    { nameAr: "أموكسيسيلين شراب 250", nameEn: "Amoxicillin Suspension", genericName: "Amoxicillin", strength: "250mg/5ml", dosageForm: "syrup", medicineType: "rx", purchase: 550, sale: 950, cat: 1, mfr: 0, rx: true },
    { nameAr: "مرهم فيوسيدين", nameEn: "Fucidin Cream", genericName: "Fusidic Acid", strength: "2%", dosageForm: "cream", medicineType: "otc", purchase: 700, sale: 1200, cat: 9, mfr: 5 },
    { nameAr: "شاش طبي معقم", nameEn: "Sterile Gauze", genericName: "Gauze", strength: "10x10cm", dosageForm: "other", medicineType: "otc", purchase: 100, sale: 200, cat: 8, mfr: 0 },
    { nameAr: "كمامات طبية (50)", nameEn: "Medical Masks (50)", genericName: "Face Mask", strength: "50pcs", dosageForm: "other", medicineType: "otc", purchase: 800, sale: 1500, cat: 8, mfr: 0 },
    { nameAr: "قفازات طبية", nameEn: "Medical Gloves", genericName: "Gloves", strength: "100pcs", dosageForm: "other", medicineType: "otc", purchase: 1000, sale: 1800, cat: 8, mfr: 0 },
    { nameAr: "موبيزيك 15 ملجم", nameEn: "Mobic 15mg", genericName: "Meloxicam", strength: "15mg", dosageForm: "tablet", medicineType: "rx", purchase: 550, sale: 950, cat: 0, mfr: 4, rx: true },
    { nameAr: "ديجوكسين 0.25 ملجم", nameEn: "Digoxin 0.25mg", genericName: "Digoxin", strength: "0.25mg", dosageForm: "tablet", medicineType: "rx", purchase: 300, sale: 550, cat: 3, mfr: 4, rx: true },
    { nameAr: "كاتافلام 50 ملجم", nameEn: "Cataflam 50mg", genericName: "Diclofenac", strength: "50mg", dosageForm: "tablet", medicineType: "otc", purchase: 400, sale: 700, cat: 0, mfr: 4 },
  ];

  const medicines = [];
  let skuCounter = 1000;
  for (const m of medicineData) {
    const med = await prisma.medicine.create({
      data: {
        categoryId: categories[m.cat].id,
        manufacturerId: manufacturers[m.mfr].id,
        sku: `MED-${skuCounter++}`,
        barcode: `89012${skuCounter}${Math.floor(Math.random() * 900 + 100)}`,
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        genericName: m.genericName,
        strength: m.strength,
        dosageForm: m.dosageForm,
        medicineType: m.medicineType,
        requiresPrescription: !!m.rx,
        unit: m.dosageForm === "syrup" || m.dosageForm === "other" ? "box" : "pack",
        minStock: 20,
        maxStock: 500,
        reorderLevel: 50,
        purchasePrice: toMinor(m.purchase),
        salePrice: toMinor(m.sale),
        wholesalePrice: toMinor(Math.round(m.sale * 0.9)),
        countryOfOrigin: manufacturers[m.mfr].country,
      },
    });
    medicines.push(med);
  }

  // Suppliers
  const supplierData = [
    { name: "Al-Yemen Medical Supplies", nameAr: "اليمن للتجهيزات الطبية", governorate: "صنعاء", city: "صنعاء", phone: "+967 1 555 111", paymentTerms: "30 days" },
    { name: "Sanaa Pharma Distribution", nameAr: "توزيع الأدوية صنعاء", governorate: "صنعاء", city: "صنعاء", phone: "+967 1 555 222", paymentTerms: "net 15" },
    { name: "Aden Medical Import", nameAr: "عدن للاستيراد الطبي", governorate: "عدن", city: "عدن", phone: "+967 2 555 333", paymentTerms: "45 days" },
    { name: "Gulf Health Trading", nameAr: "الخليج للتجارة الصحية", governorate: "حضرموت", city: "المكلا", phone: "+967 5 555 444", paymentTerms: "30 days" },
    { name: "Taiz Medico", nameAr: "تعز الطبية", governorate: "تعز", city: "تعز", phone: "+967 4 555 555", paymentTerms: "net 30" },
  ];
  const suppliers = [];
  for (const s of supplierData) {
    suppliers.push(await prisma.supplier.create({ data: s }));
  }

  // Customers
  const customerData = [
    { name: "Ali Mohammed", phone: "+967 711 111 111", gender: "male" },
    { name: "Huda Ahmed", phone: "+967 712 222 222", gender: "female" },
    { name: "Omar Saleh", phone: "+967 713 333 333", gender: "male" },
    { name: "Mona Abdulrahman", phone: "+967 714 444 444", gender: "female" },
    { name: "Yaser Al-Hadrami", phone: "+967 715 555 555", gender: "male" },
    { name: "هدى الحميري", phone: "+967 716 666 666", gender: "female" },
    { name: "طارق الشامي", phone: "+967 717 777 777", gender: "male" },
    { name: "أمل الزبيدي", phone: "+967 718 888 888", gender: "female" },
    { name: "صيدلية الشفاء", phone: "+967 719 999 999", gender: "male" },
    { name: "د. عصام المقطري", phone: "+967 710 000 000", gender: "male" },
  ];
  for (const c of customerData) {
    await prisma.customer.create({ data: c });
  }

  // Doctors
  const doctorData = [
    { name: "Dr. Ahmed Al-Absi", specialty: "طب عام", phone: "+967 733 111 111", clinic: "مستشفى الثورة العام" },
    { name: "Dr. Samira Al-Akwa", specialty: "أطفال", phone: "+967 733 222 222", clinic: "مركز الطفولة" },
    { name: "Dr. Faisal Al-Yafei", specialty: "قلب", phone: "+967 733 333 333", hospital: "مستشفى القلب" },
    { name: "Dr. Layla Al-Salahi", specialty: "جلدية", phone: "+967 733 444 444", clinic: "عيادة السلام" },
    { name: "Dr. Nasser Al-Houthi", specialty: "باطنية", phone: "+967 733 555 555", hospital: "مستشفى الكويت" },
  ];
  for (const d of doctorData) {
    await prisma.doctor.create({ data: d });
  }

  // Employees
  const employeeData = [
    { name: "Ahmed Al-Sabri", nameAr: "أحمد الصبري", role: "OWNER", salary: 250000 },
    { name: "Mohammed Ali", nameAr: "محمد علي", role: "ADMIN", salary: 150000 },
    { name: "Dr. Fatima Naji", nameAr: "د. فاطمة ناجي", role: "PHARMACIST", salary: 180000 },
    { name: "Sara Hussein", nameAr: "سارة حسين", role: "CASHIER", salary: 90000 },
    { name: "Khaled Omar", nameAr: "خالد عمر", role: "INVENTORY_MANAGER", salary: 120000 },
  ];
  for (const e of employeeData) {
    await prisma.employee.create({ data: { ...e, salary: toMinor(e.salary), branchId: branch.id, hireDate: new Date("2024-01-15") } });
  }

  // Expense categories
  for (const c of [
    { nameAr: "إيجار", nameEn: "Rent" },
    { nameAr: "رواتب", nameEn: "Salaries" },
    { nameAr: "كهرباء وماء", nameEn: "Utilities" },
    { nameAr: "نقل وتوصيل", nameEn: "Transport" },
    { nameAr: "صيانة", nameEn: "Maintenance" },
    { nameAr: "أخرى", nameEn: "Other" },
  ]) {
    await prisma.expenseCategory.create({ data: c });
  }

  // Cash account
  await prisma.cashAccount.create({
    data: { nameAr: "الصندوق الرئيسي", nameEn: "Main Cash", type: "cash" },
  });

  // Batches + stock
  const now = new Date();
  for (const [i, med] of medicines.entries()) {
    const batchCount = (i % 3) + 1;
    let totalQty = 0;
    for (let b = 0; b < batchCount; b++) {
      const expiry = new Date(now);
      expiry.setMonth(expiry.getMonth() + ((i + b) % 18) + 2);
      const qty = 50 + ((i * 7 + b * 13) % 250);
      totalQty += qty;
      await prisma.medicineBatch.create({
        data: {
          medicineId: med.id,
          supplierId: suppliers[(i + b) % suppliers.length].id,
          batchNo: `B${now.getFullYear()}${String(i + 1).padStart(3, "0")}${b + 1}`,
          mfgDate: new Date(now.getFullYear() - 1, (i + b) % 12, 1),
          expiryDate: expiry,
          initialQty: qty,
          remainingQty: qty,
          purchasePrice: med.purchasePrice,
        },
      });
    }
    await prisma.stockLevel.create({
      data: { medicineId: med.id, warehouseId: warehouse.id, qty: totalQty },
    });
  }

  // Number sequences
  for (const s of [
    { key: "invoice", prefix: "INV-", nextValue: 1, padding: 5 },
    { key: "return", prefix: "RTN-", nextValue: 1, padding: 5 },
    { key: "purchase", prefix: "PO-", nextValue: 1, padding: 5 },
    { key: "supplier_return", prefix: "SR-", nextValue: 1, padding: 5 },
    { key: "prescription", prefix: "RX-", nextValue: 1, padding: 5 },
    { key: "adjustment", prefix: "ADJ-", nextValue: 1, padding: 5 },
  ]) {
    await prisma.numberSequence.create({ data: s });
  }

  console.log("Seed complete.");
  console.log("Demo accounts (password: demo123):");
  for (const u of users) console.log(`  ${u.username} — ${u.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });