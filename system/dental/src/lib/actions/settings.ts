"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().max(120).optional(),
  website: z.string().trim().max(160).optional(),
  address: z.string().trim().max(240).optional(),
  governorate: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  currency: z.string().trim().max(12),
  taxRate: z.number().gte(0).lte(100),
  invoicePrefix: z.string().trim().max(12),
})

export type SettingsFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "server"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function updateClinicAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const actor = await requirePermission("clinic:manage")
  if (!actor.clinicId) return { error: "permission" }

  const parsed = schema.safeParse({
    name: str(formData.get("name")),
    nameAr: str(formData.get("nameAr")) || undefined,
    phone: str(formData.get("phone")) || undefined,
    email: str(formData.get("email")) || undefined,
    website: str(formData.get("website")) || undefined,
    address: str(formData.get("address")) || undefined,
    governorate: str(formData.get("governorate")) || undefined,
    city: str(formData.get("city")) || undefined,
    currency: str(formData.get("currency")),
    taxRate: num(formData.get("taxRate")),
    invoicePrefix: str(formData.get("invoicePrefix")),
  })
  if (!parsed.success) return { error: "invalid" }

  const data = {
    name: parsed.data.name,
    nameAr: parsed.data.nameAr ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email || null,
    website: parsed.data.website || null,
    address: parsed.data.address || null,
    governorate: parsed.data.governorate || null,
    city: parsed.data.city || null,
    currency: parsed.data.currency || "YER",
    taxRate: parsed.data.taxRate,
    invoicePrefix: parsed.data.invoicePrefix || "INV",
  }

  try {
    const clinic = await prisma.clinic.update({
      where: { id: actor.clinicId },
      data,
    })
    await logAudit({
      userId: actor.id,
      action: "UPDATE",
      module: "Settings",
      recordId: clinic.id,
      newValue: {
        name: clinic.name,
        phone: clinic.phone,
        currency: clinic.currency,
        taxRate: clinic.taxRate.toString(),
      },
    })
  } catch {
    return { error: "server" }
  }

  revalidatePath("/settings")
  return { ok: true }
}