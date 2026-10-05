"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { SPECIALTY_VALUES } from "@/lib/constants/admin"

const createSchema = z.object({
  userId: z.string().min(1),
  specialty: z.enum(SPECIALTY_VALUES).optional(),
  licenseNumber: z.string().trim().max(80).optional(),
  workingDays: z.array(z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"])).default([]),
})

const updateSchema = createSchema.extend({
  id: z.string().min(1),
  isActive: z.string().optional(),
})

export type DentistFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "taken" | "server"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function parseDays(formData: FormData): Array<"SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"> {
  const values = formData.getAll("workingDays")
  return values.filter((v): v is "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" =>
    typeof v === "string" && ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].includes(v)
  )
}

export async function createDentistAction(
  _prev: DentistFormState,
  formData: FormData
): Promise<DentistFormState> {
  const actor = await requirePermission("dentists:create")
  const parsed = createSchema.safeParse({
    userId: str(formData.get("userId")),
    specialty: str(formData.get("specialty")) || undefined,
    licenseNumber: str(formData.get("licenseNumber")) || undefined,
    workingDays: parseDays(formData),
  })
  if (!parsed.success) return { error: "invalid" }

  const { userId, specialty, licenseNumber, workingDays } = parsed.data

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isDentist: true },
  })
  if (!user) return { error: "not_found" }
  if (user.isDentist) return { error: "taken" }

  try {
    await prisma.$transaction([
      prisma.dentist.create({
        data: {
          userId,
          specialty,
          licenseNumber: licenseNumber ?? null,
          workingDays,
        },
      }),
      prisma.user.update({ where: { id: userId }, data: { isDentist: true } }),
    ])
    await logAudit({
      userId: actor.id,
      action: "CREATE",
      module: "Dentists",
      recordId: userId,
      newValue: { specialty, licenseNumber, workingDays },
    })
  } catch {
    return { error: "server" }
  }

  revalidatePath("/dentists")
  return { ok: true }
}

export async function updateDentistAction(
  _prev: DentistFormState,
  formData: FormData
): Promise<DentistFormState> {
  const actor = await requirePermission("dentists:edit")
  const parsed = updateSchema.safeParse({
    id: str(formData.get("id")),
    userId: str(formData.get("userId")),
    specialty: str(formData.get("specialty")) || undefined,
    licenseNumber: str(formData.get("licenseNumber")) || undefined,
    workingDays: parseDays(formData),
    isActive: str(formData.get("isActive")) || undefined,
  })
  if (!parsed.success) return { error: "invalid" }

  const { id, userId, specialty, licenseNumber, workingDays, isActive } = parsed.data

  const dentist = await prisma.dentist.findUnique({ where: { id }, select: { id: true } })
  if (!dentist) return { error: "not_found" }

  try {
    const updated = await prisma.dentist.update({
      where: { id },
      data: {
          specialty: specialty ?? "GENERAL",
        licenseNumber: licenseNumber ?? null,
        workingDays,
        isActive: isActive === "on",
      },
    })
    await logAudit({
      userId: actor.id,
      action: "UPDATE",
      module: "Dentists",
      recordId: userId,
      newValue: { specialty: updated.specialty, workingDays: updated.workingDays },
    })
  } catch {
    return { error: "server" }
  }

  revalidatePath("/dentists")
  return { ok: true }
}