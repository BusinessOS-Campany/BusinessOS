"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  address: z.string().trim().max(300).optional(),
  governorate: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
})

export type SupplierFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function parse(formData: FormData) {
  return supplierSchema.safeParse({
    name: str(formData.get("name")),
    nameAr: str(formData.get("nameAr")) || undefined,
    phone: str(formData.get("phone")) || undefined,
    email: str(formData.get("email")) || undefined,
    address: str(formData.get("address")) || undefined,
    governorate: str(formData.get("governorate")) || undefined,
    city: str(formData.get("city")) || undefined,
  })
}

export async function createSupplierAction(
  _prev: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const user = await requirePermission("suppliers:create")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  try {
    await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        nameAr: parsed.data.nameAr ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        governorate: parsed.data.governorate ?? null,
        city: parsed.data.city ?? null,
      },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Suppliers",
    newValue: { name: parsed.data.name },
  })

  return { ok: true }
}

export async function updateSupplierAction(
  _prev: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const user = await requirePermission("suppliers:edit")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  const id = str(formData.get("id"))
  if (!id) return { error: "invalid" }

  const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { error: "not_found" }

  try {
    await prisma.supplier.update({
      where: { id },
      data: {
        name: parsed.data.name,
        nameAr: parsed.data.nameAr ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        governorate: parsed.data.governorate ?? null,
        city: parsed.data.city ?? null,
      },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Suppliers",
    recordId: id,
    newValue: { name: parsed.data.name },
  })

  return { ok: true }
}