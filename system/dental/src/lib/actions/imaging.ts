"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { saveFile, deleteFile } from "@/lib/storage"

const IMAGING_TYPES = [
  "XRAY_PANORAMIC",
  "XRAY_PERIAPICAL",
  "XRAY_BITEWING",
  "XRAY_CEPHALOMETRIC",
  "XRAY_CBCT",
  "INTRAORAL_PHOTO",
  "EXTRAORAL_PHOTO",
  "OTHER",
] as const

const uploadSchema = z.object({
  patientId: z.string().min(1, "invalid"),
  type: z.enum(IMAGING_TYPES),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export type ImagingFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server" | "file" | "file_too_large" | "no_file"
}

export async function uploadImagingAction(_prev: ImagingFormState, formData: FormData): Promise<ImagingFormState> {
  const user = await requirePermission("imaging:create")
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size <= 0) return { error: "no_file" }

  const parsed = uploadSchema.safeParse({
    patientId: str("patientId"),
    type: str("type"),
    title: str("title") || undefined,
    notes: str("notes") || undefined,
  })
  if (!parsed.success) return { error: "invalid" }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true, branchId: true },
  })
  if (!patient) return { error: "not_found" }

  let stored
  try {
    stored = await saveFile(file, "imaging")
  } catch (e) {
    if (e instanceof Error && e.message === "file_too_large") {
      return { error: "file_too_large" }
    }
    return { error: "file" }
  }

  try {
    await prisma.imaging.create({
      data: {
        patientId: patient.id,
        branchId: patient.branchId ?? user.branchId,
        type: parsed.data.type,
        title: parsed.data.title ?? null,
        notes: parsed.data.notes ?? null,
        fileName: stored.fileName,
        filePath: stored.filePath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedById: user.id,
      },
    })
  } catch {
    await deleteFile(stored.filePath)
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPLOAD",
    module: "Imaging",
    recordId: patient.id,
    newValue: { type: parsed.data.type, fileName: stored.fileName, sizeBytes: stored.sizeBytes },
  })

  return { ok: true }
}

export async function deleteImagingAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("imaging:delete")
  const img = await prisma.imaging.findUnique({ where: { id }, select: { id: true, filePath: true, patientId: true } })
  if (!img) return { error: "not_found" }
  await prisma.imaging.delete({ where: { id } })
  await deleteFile(img.filePath)
  await logAudit({
    userId: user.id,
    action: "DELETE",
    module: "Imaging",
    recordId: img.patientId,
    newValue: { deletedImagingId: img.id },
  })
  return { ok: true }
}