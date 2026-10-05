"use server"

import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { PRODUCT_CATEGORIES } from "@/lib/constants/inventory"

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).optional(),
  sku: z.string().trim().min(1).max(60),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  supplierId: z.string().optional(),
  batch: z.string().trim().max(60).optional(),
  expirationDate: z.string().optional(),
  quantity: z.number().gte(0),
  minStock: z.number().gte(0),
  cost: z.number().gte(0),
  sellingPrice: z.number().gte(0),
  unit: z.string().trim().max(20).optional(),
  location: z.string().trim().max(120).optional(),
})

export type ProductFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "duplicate" | "server"
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function parse(formData: FormData) {
  return productSchema.safeParse({
    name: str(formData.get("name")),
    nameAr: str(formData.get("nameAr")) || undefined,
    sku: str(formData.get("sku")),
    category: str(formData.get("category")) || undefined,
    supplierId: str(formData.get("supplierId")) || undefined,
    batch: str(formData.get("batch")) || undefined,
    expirationDate: str(formData.get("expirationDate")) || undefined,
    quantity: num(formData.get("quantity")),
    minStock: num(formData.get("minStock")),
    cost: num(formData.get("cost")),
    sellingPrice: num(formData.get("sellingPrice")),
    unit: str(formData.get("unit")) || "pcs",
    location: str(formData.get("location")) || undefined,
  })
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const user = await requirePermission("inventory:create")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  try {
    await prisma.$transaction([
      prisma.product.create({
        data: {
          branchId: user.branchId ?? "",
          name: parsed.data.name,
          nameAr: parsed.data.nameAr ?? null,
          sku: parsed.data.sku,
          category: parsed.data.category ?? null,
          supplierId: parsed.data.supplierId ?? null,
          batch: parsed.data.batch ?? null,
          expirationDate: parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null,
          quantity: new Prisma.Decimal(parsed.data.quantity),
          minStock: new Prisma.Decimal(parsed.data.minStock),
          cost: new Prisma.Decimal(parsed.data.cost),
          sellingPrice: new Prisma.Decimal(parsed.data.sellingPrice),
          unit: parsed.data.unit ?? "pcs",
          location: parsed.data.location ?? null,
        },
      }),
    ])
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "duplicate" }
    }
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Inventory",
    newValue: { name: parsed.data.name, sku: parsed.data.sku },
  })

  return { ok: true }
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const user = await requirePermission("inventory:edit")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  const id = str(formData.get("id"))
  if (!id) return { error: "invalid" }

  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true, quantity: true } })
  if (!existing) return { error: "not_found" }

  try {
    await prisma.$transaction([
      prisma.product.update({
        where: { id },
        data: {
          name: parsed.data.name,
          nameAr: parsed.data.nameAr ?? null,
          sku: parsed.data.sku,
          category: parsed.data.category ?? null,
          supplierId: parsed.data.supplierId ?? null,
          batch: parsed.data.batch ?? null,
          expirationDate: parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null,
          minStock: new Prisma.Decimal(parsed.data.minStock),
          cost: new Prisma.Decimal(parsed.data.cost),
          sellingPrice: new Prisma.Decimal(parsed.data.sellingPrice),
          unit: parsed.data.unit ?? "pcs",
          location: parsed.data.location ?? null,
        },
      }),
    ])
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "duplicate" }
    }
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Inventory",
    recordId: id,
    newValue: { name: parsed.data.name, sku: parsed.data.sku },
  })

  return { ok: true }
}

export async function deleteProductAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("inventory:delete")
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { error: "not_found" }
  await prisma.product.delete({ where: { id } })
  await logAudit({ userId: user.id, action: "DELETE", module: "Inventory", recordId: id })
  return { ok: true }
}

const STOCK_IN_TYPES = new Set(["STOCK_IN", "TRANSFER_IN", "ADJUSTMENT"])

export async function adjustStockAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const user = await requirePermission("inventory:edit")

  const productId = str(formData.get("productId"))
  const type = str(formData.get("type"))
  const quantity = num(formData.get("quantity"))
  const notes = str(formData.get("notes")) || undefined

  const VALID_TYPES = ["STOCK_IN", "STOCK_OUT", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT"]
  if (!productId || !VALID_TYPES.includes(type) || !(quantity > 0)) return { error: "invalid" }

  const movement = { type, quantity, notes }

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, quantity: true },
      })
      if (!product) throw new Error("not_found")

      const increase = STOCK_IN_TYPES.has(type)
      const delta = increase ? quantity : -quantity
      const next = Number(product.quantity) + delta
      if (next < 0) throw new Error("negative")

      await tx.product.update({
        where: { id: productId },
        data: { quantity: new Prisma.Decimal(next) },
      })
      await tx.stockMovement.create({
        data: {
          productId,
          branchId: user.branchId ?? "",
          type: type as never,
          quantity: new Prisma.Decimal(quantity),
          notes: notes ?? null,
          userId: user.id,
        },
      })
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Inventory",
    recordId: productId,
    newValue: { movement: movement.type, quantity: String(quantity) },
  })

  return { ok: true }
}