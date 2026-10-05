import { z } from "zod";

export const posCartItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().int().min(0),
  discount: z.number().int().min(0).default(0),
});

export type PosCartItem = z.infer<typeof posCartItemSchema>;

export const posHoldSchema = z.object({
  warehouseId: z.string().min(1),
  customerId: z.string().min(1).nullable().optional(),
  cashAccountId: z.string().min(1).nullable().optional(),
  items: z.array(posCartItemSchema).min(1).max(200),
  notes: z.string().max(1000).optional(),
  discountTotal: z.number().int().min(0).default(0),
  label: z.string().max(100).optional(),
});

export type PosHoldInput = z.infer<typeof posHoldSchema>;

export const posResumeSchema = z.object({
  holdId: z.string().min(1),
});

export const posPaySchema = z.object({
  holdId: z.string().min(1).optional(),
  customerId: z.string().min(1).nullable().optional(),
  warehouseId: z.string().min(1),
  cashAccountId: z.string().min(1).nullable().optional(),
  items: z.array(posCartItemSchema).min(1).max(200),
  cashPaid: z.number().int().min(0),
  notes: z.string().max(1000).optional(),
  discountTotal: z.number().int().min(0).default(0),
});

export type PosPayInput = z.infer<typeof posPaySchema>;

export type ReceiptWidth = "58mm" | "80mm" | "a4";

export interface ReceiptItem {
  name: string;
  nameAr?: string;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface ReceiptData {
  number: string;
  issuedAt: string;
  items: ReceiptItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  cashPaid: number;
  creditPortion: number;
  customerName?: string;
  cashierName?: string;
}

export interface ReceiptBranding {
  orgNameAr: string;
  orgNameEn: string;
  logoDataUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export interface ReceiptTemplate {
  html: string;
  widthPx: number;
}
