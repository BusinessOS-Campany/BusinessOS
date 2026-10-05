"use server"

import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"

function isDentition(v: string): v is "ADULT" | "PRIMARY" {
  return v === "ADULT" || v === "PRIMARY"
}

function isCondition(v: string): boolean {
  return [
    "HEALTHY", "CARIES", "DEEP_CARIES", "FILLING", "FAILED_FILLING", "CROWN", "BRIDGE", "IMPLANT",
    "MISSING", "EXTRACTED", "ROOT_CANAL", "ROOT_CANAL_NEEDED", "FRACTURE", "CRACK", "MOBILITY",
    "PERIODONTAL_ISSUE", "ABSCESS", "INFECTION", "IMPACTED", "RETAINED_PRIMARY_TOOTH", "WEAR",
    "EROSION", "ABRASION", "DISCOLORATION", "VENEER", "SEALANT", "OTHER",
  ].includes(v)
}

const SURFACES = ["MESIAL", "DISTAL", "OCCLUSAL", "BUCCAL", "LINGUAL", "INCISAL", "CERVICAL"]

export interface SaveConditionInput {
  condition: string
  surfaces: string[]
  severity: string | null
  notes: string | null
}

export async function saveToothConditionsAction(
  patientId: string,
  toothNumber: number,
  dentition: string,
  items: SaveConditionInput[]
): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission("dentalChart:edit")

  if (!patientId || !Number.isInteger(toothNumber) || toothNumber < 1 || toothNumber > 99) {
    return { ok: false, error: "invalid" }
  }
  if (!isDentition(dentition)) return { ok: false, error: "invalid" }
  const clean = (items ?? []).filter(
    (i) => isCondition(i.condition) && (i.surfaces ?? []).every((s) => SURFACES.includes(s))
  )
  if (clean.length === 0) return { ok: false, error: "invalid" }

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
  if (!patient) return { ok: false, error: "not_found" }

  try {
    await prisma.$transaction(async (tx) => {
      let record = await tx.toothRecord.findUnique({
        where: {
          patientId_toothNumber_dentition: { patientId, toothNumber, dentition: dentition as never },
        },
        select: { id: true, toothNameEn: true, toothNameAr: true, toothType: true, jaw: true },
      })

      if (!record) {
        record = await tx.toothRecord.create({
          data: {
            patientId,
            toothNumber,
            dentition: dentition as never,
          },
          select: { id: true, toothNameEn: true, toothNameAr: true, toothType: true, jaw: true },
        })
      }

      for (const item of clean) {
        await tx.toothCondition.create({
          data: {
            toothRecordId: record.id,
            condition: item.condition as never,
            surfaces: item.surfaces as never[],
            severity: item.severity ? (item.severity as never) : null,
            notes: item.notes ?? null,
            dentistId: user.dentistId ?? null,
            status: "ACTIVE",
            date: new Date(),
          },
        })
      }
    })

    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "DentalChart",
      recordId: patientId,
      newValue: { toothNumber, dentition, count: clean.length },
    })

    return { ok: true }
  } catch {
    return { ok: false, error: "server" }
  }
}

export async function removeToothConditionAction(conditionId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission("dentalChart:edit")
  if (!conditionId) return { ok: false, error: "invalid" }

  try {
    await prisma.toothCondition.delete({ where: { id: conditionId } })
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "DentalChart",
      recordId: conditionId,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "server" }
  }
}

export async function clearTeethAction(patientId: string, dentition: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission("dentalChart:edit")
  if (!patientId || !isDentition(dentition)) return { ok: false, error: "invalid" }

  try {
    await prisma.toothRecord.deleteMany({ where: { patientId, dentition: dentition as never } })
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "DentalChart",
      recordId: patientId,
      newValue: { dentition },
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "server" }
  }
}