import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(200).optional(),
  creditLimit: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  groupId: z.string().min(1).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(200).optional(),
  creditLimit: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export const createCustomerGroupSchema = z.object({
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  discountRate: z.number().min(0).max(100).optional(),
  priceMode: z.enum(["retail", "wholesale"]).optional(),
});

export const updateCustomerGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameAr: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  discountRate: z.number().min(0).max(100).optional(),
  priceMode: z.enum(["retail", "wholesale"]).optional(),
});

export const recordTransactionSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["debt", "payment", "refund", "adjustment"]),
  amount: z.number().int(),
  refType: z.string().max(100).optional(),
  refId: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateCustomerGroupInput = z.infer<typeof createCustomerGroupSchema>;
export type UpdateCustomerGroupInput = z.infer<typeof updateCustomerGroupSchema>;
export type RecordTransactionInput = z.infer<typeof recordTransactionSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListCustomersOpts {
  search?: string;
  groupId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListTransactionsOpts {
  type?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Customer CRUD ─────────────────────────────────────────────────────────────

export async function listCustomers(organizationId: string, opts?: ListCustomersOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.customerWhereInput = { organizationId };
  if (opts?.isActive !== undefined) where.isActive = opts.isActive;
  if (opts?.groupId) where.notes = opts.groupId; // placeholder — see note below
  if (opts?.search) {
    where.OR = [
      { name: { contains: opts.search, mode: "insensitive" } },
      { phone: { contains: opts.search, mode: "insensitive" } },
      { email: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { name: "asc" },
    }),
    prisma.customer.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getCustomer(organizationId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId },
  });
  if (!customer) throw ApiError.notFound("Customer not found");
  return customer;
}

export async function createCustomer(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  data: CreateCustomerInput,
) {
  const parsed = createCustomerSchema.parse(data);

  if (parsed.groupId) {
    const group = await tx.customerGroup.findFirst({
      where: { id: parsed.groupId, organizationId },
      select: { id: true },
    });
    if (!group) throw ApiError.notFound("Customer group not found");
  }

  const code = await generateCustomerCode(tx, organizationId);

  const customer = await tx.customer.create({
    data: {
      organizationId,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      creditLimit: parsed.creditLimit ? BigInt(parsed.creditLimit) : 0n,
      notes: parsed.groupId ? `group:${parsed.groupId}` : parsed.notes,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "customer.created",
    entityType: "customer",
    entityId: customer.id,
    after: { name: customer.name, code },
  });

  return { ...customer, code };
}

export async function updateCustomer(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateCustomerInput,
) {
  const parsed = updateCustomerSchema.parse(data);

  const existing = await tx.customer.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Customer not found");

  const customer = await tx.customer.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.phone !== undefined && { phone: parsed.phone }),
      ...(parsed.email !== undefined && { email: parsed.email }),
      ...(parsed.creditLimit !== undefined && { creditLimit: BigInt(parsed.creditLimit) }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "customer.updated",
    entityType: "customer",
    entityId: id,
    after: parsed,
  });

  return customer;
}

export async function deleteCustomer(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const customer = await tx.customer.findFirst({
    where: { id, organizationId },
  });
  if (!customer) throw ApiError.notFound("Customer not found");

  if (customer.balance !== 0n) {
    throw ApiError.badRequest(
      "Cannot delete customer with outstanding balance. Settle balance first.",
    );
  }

  const customer2 = await tx.customer.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "customer.deleted",
    entityType: "customer",
    entityId: id,
    before: { name: customer.name, balance: customer.balance.toString() },
  });

  return { deleted: true };
}

// ── Customer Groups ───────────────────────────────────────────────────────────

export async function listCustomerGroups(organizationId: string) {
  const groups = await prisma.customerGroup.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return groups;
}

export async function createCustomerGroup(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  data: CreateCustomerGroupInput,
) {
  const parsed = createCustomerGroupSchema.parse(data);

  const existing = await tx.customerGroup.findFirst({
    where: { organizationId, name: parsed.name },
  });
  if (existing) throw ApiError.conflict("Customer group name already exists");

  const group = await tx.customerGroup.create({
    data: {
      organizationId,
      name: parsed.name,
      nameAr: parsed.nameAr,
      description: parsed.description,
      discountRate: parsed.discountRate ?? 0,
      priceMode: parsed.priceMode ?? "retail",
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "customer_group.created",
    entityType: "customer_group",
    entityId: group.id,
    after: { name: group.name },
  });

  return group;
}

export async function updateCustomerGroup(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateCustomerGroupInput,
) {
  const parsed = updateCustomerGroupSchema.parse(data);

  const existing = await tx.customerGroup.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Customer group not found");

  if (parsed.name && parsed.name !== existing.name) {
    const duplicate = await tx.customerGroup.findFirst({
      where: { organizationId, name: parsed.name, id: { not: id } },
    });
    if (duplicate) throw ApiError.conflict("Customer group name already exists");
  }

  const group = await tx.customerGroup.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.nameAr !== undefined && { nameAr: parsed.nameAr }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.discountRate !== undefined && { discountRate: parsed.discountRate }),
      ...(parsed.priceMode !== undefined && { priceMode: parsed.priceMode }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "customer_group.updated",
    entityType: "customer_group",
    entityId: id,
    after: parsed,
  });

  return group;
}

export async function deleteCustomerGroup(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const group = await tx.customerGroup.findFirst({
    where: { id, organizationId },
  });
  if (!group) throw ApiError.notFound("Customer group not found");

  await tx.customerGroup.delete({ where: { id } });

  await writeAuditLog(tx, { organizationId }, {
    action: "customer_group.deleted",
    entityType: "customer_group",
    entityId: id,
    before: { name: group.name },
  });

  return { deleted: true };
}

// ── Customer Transactions (Ledger) ────────────────────────────────────────────

export async function recordCustomerTransaction(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: RecordTransactionInput,
) {
  const parsed = recordTransactionSchema.parse(data);

  const customer = await tx.customer.findFirst({
    where: { id: parsed.customerId, organizationId },
  });
  if (!customer) throw ApiError.notFound("Customer not found");

  const amount = BigInt(parsed.amount);
  let balanceDelta = 0n;
  if (parsed.type === "debt") {
    balanceDelta = amount;
  } else if (parsed.type === "payment" || parsed.type === "refund") {
    balanceDelta = -amount;
  }

  const balanceAfter = customer.balance + balanceDelta;

  const transaction = await tx.customerTransaction.create({
    data: {
      organizationId,
      customerId: parsed.customerId,
      type: parsed.type,
      amount,
      balanceAfter,
      refType: parsed.refType,
      refId: parsed.refId,
      note: parsed.note,
      createdByUserId: userId,
    },
  });

  await tx.customer.update({
    where: { id: parsed.customerId },
    data: { balance: balanceAfter },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: `customer_transaction.${parsed.type}`,
    entityType: "customer_transaction",
    entityId: transaction.id,
    after: {
      customerId: parsed.customerId,
      type: parsed.type,
      amount: amount.toString(),
      balanceAfter: balanceAfter.toString(),
    },
  });

  return { ...transaction, balanceAfter };
}

export async function listCustomerTransactions(
  organizationId: string,
  customerId: string,
  opts?: ListTransactionsOpts,
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw ApiError.notFound("Customer not found");

  const where: Prisma.customerTransactionWhereInput = {
    organizationId,
    customerId,
  };
  if (opts?.type) where.type = opts.type;
  if (opts?.from || opts?.to) {
    where.createdAt = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.customerTransaction.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.customerTransaction.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getCustomerStatement(organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) throw ApiError.notFound("Customer not found");

  const transactions = await prisma.customerTransaction.findMany({
    where: { organizationId, customerId },
    orderBy: { createdAt: "asc" },
  });

  let openingBalance = 0n;
  if (transactions.length > 0) {
    const first = transactions[0];
    if (first.type === "debt") {
      openingBalance = first.balanceAfter - first.amount;
    } else if (first.type === "payment" || first.type === "refund") {
      openingBalance = first.balanceAfter + first.amount;
    } else {
      openingBalance = first.balanceAfter;
    }
  }

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      creditLimit: customer.creditLimit,
    },
    openingBalance,
    closingBalance: customer.balance,
    transactions,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateCustomerCode(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  const count = await tx.customer.count({
    where: { organizationId },
  });
  const next = count + 1;
  return `CUS-${String(next).padStart(4, "0")}`;
}
