"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"

const patientSchema = z.object({
  firstName: z.string().trim().min(2),
  middleName: z.string().trim().optional(),
  lastName: z.string().trim().min(2),
  gender: z.enum(["MALE", "FEMALE"]),
  dateOfBirth: z.string().optional(),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
})

export type PatientFormState = {
  error?: "invalid" | "permission" | "not_found" | "server"
  fieldErrors?: Record<string, string[]>
}

function parsePatientForm(formData: FormData) {
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : undefined
  }
  return {
    firstName: str("firstName"),
    middleName: str("middleName") || undefined,
    lastName: str("lastName"),
    gender: str("gender"),
    dateOfBirth: str("dateOfBirth") || undefined,
    phone: str("phone") || undefined,
    whatsapp: str("whatsapp") || undefined,
    governorate: str("governorate") || undefined,
    city: str("city") || undefined,
    notes: str("notes") || undefined,
  }
}

async function nextPatientNo(): Promise<string> {
  const last = await prisma.patient.findFirst({
    select: { patientNo: true },
    orderBy: { patientNo: "desc" },
  })
  const num = last ? parseInt(last.patientNo.replace(/\D+/g, ""), 10) + 1 : 1
  return `P-${String(num).padStart(4, "0")}`
}

export async function createPatientAction(
  _prev: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const user = await requirePermission("patients:create")

  const parsed = patientSchema.safeParse(parsePatientForm(formData))
  if (!parsed.success) {
    return {
      error: "invalid",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const data = parsed.data
  const patientNo = await nextPatientNo()
  const clinicId = user.clinicId ?? (await prisma.clinic.findFirstOrThrow({ select: { id: true } })).id

  let patient: { id: string } | null = null
  try {
    patient = await prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          clinicId,
          branchId: user.branchId,
          patientNo,
          firstName: data.firstName,
          middleName: data.middleName ?? null,
          lastName: data.lastName,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          phone: data.phone ?? null,
          whatsapp: data.whatsapp ?? null,
          governorate: data.governorate ?? null,
          city: data.city ?? null,
        },
        select: { id: true },
      })

      await tx.patientAlert.create({
        data: {
          patientId: created.id,
          type: "NEW_PATIENT",
          severity: "MILD",
          message: "New patient registered",
        },
      })

      return created
    })

    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "Patients",
      recordId: patient.id,
      newValue: { patientNo },
    })
  } catch {
    return { error: "server" }
  }

  redirect(`/patients/${patient!.id}`)
}

export async function updatePatientAction(
  patientId: string,
  _prev: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const user = await requirePermission("patients:edit")

  const parsed = patientSchema.safeParse(parsePatientForm(formData))
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const existing = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
  if (!existing) return { error: "not_found" }

  const data = parsed.data
  await prisma.patient.update({
    where: { id: patientId },
    data: {
      firstName: data.firstName,
      middleName: data.middleName ?? null,
      lastName: data.lastName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      governorate: data.governorate ?? null,
      city: data.city ?? null,
    },
  })

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Patients",
    recordId: patientId,
  })

  redirect(`/patients/${patientId}`)
}

export async function togglePatientActiveAction(patientId: string, isActive: boolean) {
  const user = await requirePermission("patients:edit")
  const existing = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
  if (!existing) return { ok: false as const, error: "not_found" }

  await prisma.patient.update({ where: { id: patientId }, data: { isActive } })
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Patients",
    recordId: patientId,
    newValue: { isActive },
  })

  return { ok: true as const }
}