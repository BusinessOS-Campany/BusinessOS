import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { SessionPayload } from "@/lib/auth"
import type { Permission } from "@/lib/permissions"

export type CurrentUser = {
  id: string
  name: string
  nameAr: string | null
  email: string
  role: string
  roleNameAr: string
  permissions: Permission[]
  branchId: string | null
  clinicId: string | null
  isDentist: boolean
  dentistId: string | null
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession()
  if (!session?.userId) return null
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        role: { select: { key: true, nameAr: true, permissions: true } },
        branch: { select: { clinicId: true } },
        dentist: { select: { id: true } },
      },
    })
    if (!user || !user.isActive) return null
    return {
      id: user.id,
      name: user.name,
      nameAr: user.nameAr,
      email: user.email,
      role: user.role.key,
      roleNameAr: user.role.nameAr ?? user.role.key,
      permissions: user.role.permissions as Permission[],
      branchId: user.branchId,
      clinicId: user.branch?.clinicId ?? null,
      isDentist: user.isDentist,
      dentistId: user.dentist?.id ?? null,
    }
  } catch {
    return null
  }
})

export const requireAuth = cache(async () => {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
})

export function hasPermission(user: { permissions: Permission[] } | null, permission: Permission): boolean {
  if (!user) return false
  if (user.permissions.includes("clinic:manage")) return true
  return user.permissions.includes(permission)
}

export const requirePermission = cache(async (permission: Permission) => {
  const user = await requireAuth()
  if (!hasPermission(user, permission)) redirect("/forbidden")
  return user
})

export type { SessionPayload }