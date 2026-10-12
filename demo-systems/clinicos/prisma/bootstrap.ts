import "dotenv/config"
import { prisma } from "@/lib/db"
import { ROLE_CODES, ROLE_PERMISSIONS } from "@/core/rbac/catalog"

async function main() {
  console.log("Bootstrapping clinicOS system...")

  // Create roles
  for (const code of ROLE_CODES) {
    const names: { ar: string; en: string } = {
      super_admin: { ar: "?????? ?? ???????????????", en: "Platform Administrator" },
      manager: { ar: "?????? ?? ???????????????", en: "Clinic Manager" },
      receptionist: { ar: "???????? ?? ???????????????", en: "Receptionist" },
      physician: { ar: "???????? ???", en: "Physician" },
      nurse: { ar: "??????? / ???????", en: "Nurse / Triage" },
      lab_tech: { ar: "?????? ?? ???????????", en: "Laboratory Technician" },
      lab_reviewer: { ar: "???????? ???????????", en: "Laboratory Reviewer" },
      imaging_tech: { ar: "?????? ?????????", en: "Radiology Technician" },
      pharmacist: { ar: "???????????", en: "Pharmacist" },
      cashier: { ar: "???????????", en: "Cashier" },
      accountant: { ar: "???????????", en: "Accountant" },
      procurement: { ar: "???????? ???????????", en: "Procurement Officer" },
      inventory: { ar: "?????? ?????????", en: "Inventory Manager" },
      insurance: { ar: "?????? ?????????", en: "Insurance Officer" },
      auditor: { ar: "???????????", en: "Auditor" },
    }

    const role = await prisma.role.upsert({
      where: { code },
      create: {
        code,
        nameAr: names[code]?.ar ?? "",
        nameEn: names[code]?.en ?? "",
        description: `System role: ${names[code]?.en ?? "Unknown"}`,
        isSystem: true,
      },
      update: {
        nameAr: names[code]?.ar ?? "",
        nameEn: names[code]?.en ?? "",
      },
    })
    console.log(`  Created role: ${code}`)
  }

  // Create role-permission mappings
  const allPermissions = await prisma.permission.findMany({
    select: { id: true, code: true },
  })
  const permissionIdByCode = new Map(allPermissions.map((p) => [p.code, p.id]))

  for const [code, grants] of Object.entries(ROLE_PERMISSIONS) as [
    string,
    string[],
  ][]) {
    const role = await prisma.role.findUnique({ where: { code } })
    if (!role) continue

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })

    const data = grants
      .map((perm) => {
        const permissionId = permissionIdByCode.get(perm)
        return permissionId ? { roleId: role.id, permissionId } : null
      })
      .filter((x): x is { roleId: string; permissionId: string } => x !== null)

    if (data.length) {
      await prisma.rolePermission.createMany({ data })
      console.log(`  Set permissions for role: ${code} (${data.length} grants)`)
    }
  }

  console.log("Bootstrap complete")
}

main().catch((e) => {
  console.error("Bootstrap failed:", e)
  process.exit(1)
})