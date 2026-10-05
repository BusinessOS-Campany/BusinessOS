"use server"

import { z } from "zod"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().max(120).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]+$/).max(40).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8),
  roleId: z.string().min(1),
  branchId: z.string().optional(),
})

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().max(120).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]+$/).max(40).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  roleId: z.string().min(1),
  branchId: z.string().optional(),
  isActive: z.string().optional(),
  password: z.string().min(8).optional(),
})

export type StaffFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "duplicate_email" | "duplicate_username" | "self" | "server"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function usernameValue(v: unknown): string | undefined {
  const s = str(v).trim().toLowerCase()
  return s || undefined
}

export async function createUserAction(
  _prev: StaffFormState,
  formData: FormData
): Promise<StaffFormState> {
  const actor = await requirePermission("staff:create")
  const parsed = createSchema.safeParse({
    name: str(formData.get("name")),
    nameAr: str(formData.get("nameAr")) || undefined,
    username: usernameValue(formData.get("username")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")) || undefined,
    password: str(formData.get("password")),
    roleId: str(formData.get("roleId")),
    branchId: str(formData.get("branchId")) || undefined,
  })
  if (!parsed.success) return { error: "invalid" }

  const { name, nameAr, username, email, phone, password, roleId, branchId } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) return { error: "duplicate_email" }
  if (username) {
    const dup = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (dup) return { error: "duplicate_username" }
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        nameAr: nameAr ?? null,
        username: username ?? null,
        email,
        phone: phone ?? null,
        passwordHash: await hash(password, 10),
        roleId,
        branchId: branchId ?? null,
      },
    })
    await logAudit({
      userId: actor.id,
      action: "CREATE",
      module: "Staff",
      recordId: user.id,
      newValue: { name: user.name, username: user.username, email: user.email, roleId },
    })
  } catch {
    return { error: "server" }
  }

  revalidatePath("/staff")
  return { ok: true }
}

export async function updateUserAction(
  _prev: StaffFormState,
  formData: FormData
): Promise<StaffFormState> {
  const actor = await requirePermission("staff:edit")
  const parsed = updateSchema.safeParse({
    id: str(formData.get("id")),
    name: str(formData.get("name")),
    nameAr: str(formData.get("nameAr")) || undefined,
    username: usernameValue(formData.get("username")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")) || undefined,
    roleId: str(formData.get("roleId")),
    branchId: str(formData.get("branchId")) || undefined,
    isActive: str(formData.get("isActive")) || undefined,
    password: str(formData.get("password")) || undefined,
  })
  if (!parsed.success) return { error: "invalid" }

  const { id, name, nameAr, username, email, phone, roleId, branchId, isActive, password } = parsed.data
  if (id === actor.id) return { error: "self" }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, username: true } })
  if (!target) return { error: "not_found" }
  if (email !== target.email) {
    const dup = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (dup) return { error: "duplicate_email" }
  }
  if (username && username !== target.username) {
    const dup = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (dup) return { error: "duplicate_username" }
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        nameAr: nameAr ?? null,
        username: username ?? null,
        email,
        phone: phone ?? null,
        roleId,
        branchId: branchId ?? null,
        isActive: isActive === "on",
        ...(password ? { passwordHash: await hash(password, 10) } : {}),
      },
    })
    await logAudit({
      userId: actor.id,
      action: "UPDATE",
      module: "Staff",
      recordId: user.id,
      newValue: { name: user.name, username: user.username, email: user.email, roleId, isActive: user.isActive },
    })
  } catch {
    return { error: "server" }
  }

  revalidatePath("/staff")
  return { ok: true }
}