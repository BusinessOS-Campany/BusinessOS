"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"

const itemSchema = z.object({
  name: z.string().trim().min(1),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  route: z.string().optional(),
  quantity: z.string().optional(),
  instructions: z.string().optional(),
})

const prescriptionSchema = z.object({
  patientId: z.string().min(1),
  dentistId: z.string().optional(),
  instructions: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
})

export type PrescriptionFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server"
  fieldErrors?: Record<string, string[]>
}

export async function createPrescriptionAction(
  _prev: PrescriptionFormState,
  formData: FormData
): Promise<PrescriptionFormState> {
  const user = await requirePermission("prescriptions:create")

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const names = formData.getAll("itemName") as string[]
  const doses = formData.getAll("itemDose") as string[]
  const freqs = formData.getAll("itemFrequency") as string[]
  const durations = formData.getAll("itemDuration") as string[]
  const routes = formData.getAll("itemRoute") as string[]
  const quantities = formData.getAll("itemQuantity") as string[]
  const instrs = formData.getAll("itemInstructions") as string[]

  const items = names.map((name, i) => ({
    name,
    dose: doses[i] || undefined,
    frequency: freqs[i] || undefined,
    duration: durations[i] || undefined,
    route: routes[i] || undefined,
    quantity: quantities[i] || undefined,
    instructions: instrs[i] || undefined,
  }))

  const parsed = prescriptionSchema.safeParse({
    patientId: str("patientId"),
    dentistId: str("dentistId") || undefined,
    instructions: str("instructions") || undefined,
    notes: str("notes") || undefined,
    items,
  })

  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true },
  })
  if (!patient) return { error: "not_found" }

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.prescription.create({
        data: {
          patientId: parsed.data.patientId,
          dentistId: parsed.data.dentistId ?? null,
          instructions: parsed.data.instructions ?? null,
          notes: parsed.data.notes ?? null,
        },
        select: { id: true },
      })
      for (const item of parsed.data.items) {
        await tx.prescriptionItem.create({
          data: {
            prescriptionId: created.id,
            medicationName: item.name,
            dose: item.dose ?? null,
            frequency: item.frequency ?? null,
            duration: item.duration ?? null,
            route: item.route ?? null,
            quantity: item.quantity ?? null,
            instructions: item.instructions ?? null,
          },
        })
      }
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Prescriptions",
    recordId: patient.id,
    newValue: { itemCount: parsed.data.items.length },
  })

  return { ok: true }
}

export type { PrescriptionFormState as RxFormState }