import "dotenv/config"
import { prisma } from "@/lib/db"

async function main() {
  console.log("Bootstrapping clinicOS system...")

  // Create essential roles
  const roleCodes = ["super_admin", "manager", "receptionist", "physician"]
  for (const code of roleCodes) {
    await prisma.role.upsert({
      where: { code },
      create: {
        code,
        nameAr: "",
        nameEn: code.replace("_", " ").toUpperCase(),
        isSystem: true,
      },
      update: {},
    })
  }

  // Create basic role-permission mappings
  const permissions = ["patients:read", "patients:write", "appointments:read", "appointments:write"]
  const allPermissions = await prisma.permission.findMany({ select: { id: true, code: true } })
  const permissionIdByCode = new Map(
    allPermissions.map((p: any) => [p.code, p.id])
  )

  for (const code of roleCodes) {
    const role = await prisma.role.findUnique({ where: { code } })
    if (!role) continue
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    const data = permissions
      .map((perm: any) => {
        const permissionId = permissionIdByCode.get(perm)
        return permissionId ? { roleId: role.id, permissionId } : null
      })
      .filter((x: any) => x !== null)
    if (data.length) {
      await prisma.rolePermission.createMany({ data })
    }
  }

  console.log("Bootstrap complete")
}

main().catch((e) => {
  console.error("Bootstrap failed:", e)
  process.exit(1)
})