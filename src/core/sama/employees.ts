import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  department: z.string().max(200).optional(),
  phone: z.string().max(32).optional(),
  salary: z.number().int().min(0).optional(),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  department: z.string().max(200).optional(),
  phone: z.string().max(32).optional(),
  salary: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListEmployeesOpts {
  search?: string;
  department?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

// ── Employee CRUD ─────────────────────────────────────────────────────────────

export async function listEmployees(organizationId: string, opts?: ListEmployeesOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaEmployeeWhereInput = { organizationId };
  if (opts?.isActive !== undefined) where.isActive = opts.isActive;
  if (opts?.department) where.department = opts.department;
  if (opts?.search) {
    where.OR = [
      { name: { contains: opts.search, mode: "insensitive" } },
      { phone: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.samaEmployee.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { name: "asc" },
    }),
    prisma.samaEmployee.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getEmployee(organizationId: string, id: string) {
  const employee = await prisma.samaEmployee.findFirst({
    where: { id, organizationId },
  });
  if (!employee) throw ApiError.notFound("Employee not found");
  return employee;
}

export async function createEmployee(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateEmployeeInput,
) {
  const parsed = createEmployeeSchema.parse(data);

  const employee = await tx.samaEmployee.create({
    data: {
      organizationId,
      name: parsed.name,
      department: parsed.department,
      phone: parsed.phone,
      salary: parsed.salary ? BigInt(parsed.salary) : null,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_employee.created",
    entityType: "sama_employee",
    entityId: employee.id,
    after: { name: employee.name, department: employee.department },
  });

  return employee;
}

export async function updateEmployee(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateEmployeeInput,
) {
  const parsed = updateEmployeeSchema.parse(data);

  const existing = await tx.samaEmployee.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Employee not found");

  const employee = await tx.samaEmployee.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.department !== undefined && { department: parsed.department }),
      ...(parsed.phone !== undefined && { phone: parsed.phone }),
      ...(parsed.salary !== undefined && { salary: parsed.salary ? BigInt(parsed.salary) : null }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_employee.updated",
    entityType: "sama_employee",
    entityId: id,
    after: parsed,
  });

  return employee;
}

export async function deleteEmployee(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const employee = await tx.samaEmployee.findFirst({
    where: { id, organizationId },
  });
  if (!employee) throw ApiError.notFound("Employee not found");

  await tx.samaEmployee.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_employee.deleted",
    entityType: "sama_employee",
    entityId: id,
    before: { name: employee.name },
  });

  return { deleted: true };
}
