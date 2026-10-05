import path from "path"
import fs from "fs/promises"
import crypto from "crypto"

const UPLOAD_ROOT =
  process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.length > 0
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "serverdata", "uploads")

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024)

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ""
}

export function mimeFromExt(fileName: string): string {
  return EXT_MIME[extOf(fileName)] ?? "application/octet-stream"
}

function safeExt(fileName: string): string {
  const ext = extOf(fileName)
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin"
}

export interface StoredFile {
  fileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
}

async function ensureRoot(): Promise<void> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true })
}

function resolveFromRoot(relativePath: string): string | null {
  const target = path.resolve(UPLOAD_ROOT, relativePath)
  if (!target.startsWith(UPLOAD_ROOT + path.sep) && target !== UPLOAD_ROOT) return null
  return target
}

export async function saveFile(file: File, subdir: string): Promise<StoredFile> {
  if (file.size <= 0) throw new Error("empty_file")
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("file_too_large")
  const safeSub = subdir.replace(/[^a-z0-9_]/gi, "")
  const savedName = `${crypto.randomUUID()}.${safeExt(file.name)}`
  const rel = safeSub ? `${safeSub}/${savedName}` : savedName
  const target = resolveFromRoot(rel)
  if (!target) throw new Error("invalid_path")
  await ensureRoot()
  await fs.mkdir(path.dirname(target), { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(/* turbopackIgnore: true */ target, buffer)
  return {
    fileName: file.name,
    filePath: rel,
    mimeType: file.type || mimeFromExt(file.name),
    sizeBytes: file.size,
  }
}

export async function deleteFile(relativePath: string): Promise<void> {
  const target = resolveFromRoot(relativePath)
  if (!target) return
  try {
    await fs.unlink(/* turbopackIgnore: true */ target)
  } catch {
    // not found — ignore
  }
}

export async function readStoredFile(relativePath: string): Promise<Buffer | null> {
  const target = resolveFromRoot(relativePath)
  if (!target) return null
  try {
    return await fs.readFile(/* turbopackIgnore: true */ target)
  } catch {
    return null
  }
}