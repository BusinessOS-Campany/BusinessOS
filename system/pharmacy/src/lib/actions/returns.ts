"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/dal";
import { createSalesReturn, createSupplierReturn } from "@/lib/returns";

const salesReturnSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().optional().nullable(),
  cashAccountId: z.string().optional().nullable(),
  items: z.array(
    z.object({
      salesInvoiceItemId: z.string().min(1),
      medicineId: z.string().min(1),
      batchId: z.string().optional().nullable(),
      qty: z.coerce.number().positive(),
      unitPrice: z.coerce.number().nonnegative(),
      lineTotal: z.coerce.number().nonnegative(),
    })
  ),
});

const supplierReturnSchema = z.object({
  supplierId: z.string().min(1),
  purchaseId: z.string().optional().nullable(),
  reason: z.string().min(1),
  items: z.array(
    z.object({
      medicineId: z.string().min(1),
      batchId: z.string().optional().nullable(),
      qty: z.coerce.number().positive(),
      unitCost: z.coerce.number().nonnegative(),
    })
  ),
});

export async function submitSalesReturn(input: z.infer<typeof salesReturnSchema>) {
  const user = await requirePermission("returns:create");
  const data = salesReturnSchema.parse(input);
  const result = await createSalesReturn({
    ...data,
    items: data.items.map((i) => ({ ...i, batchId: i.batchId ?? null })),
    userId: user.id,
  });
  revalidatePath("/returns");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return result;
}

export async function submitSupplierReturn(input: z.infer<typeof supplierReturnSchema>) {
  const user = await requirePermission("returns:create");
  const data = supplierReturnSchema.parse(input);
  const result = await createSupplierReturn({
    ...data,
    purchaseId: data.purchaseId ?? null,
    items: data.items.map((i) => ({ ...i, batchId: i.batchId ?? null })),
    userId: user.id,
  });
  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/batches");
  return result;
}