"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { toMinor } from "@/lib/format";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  role: z.string().min(1),
  branchId: z.string().optional().nullable(),
  salary: z.coerce.number().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type EmployeeInput = z.infer<typeof schema>;

export async function saveEmployee(input: EmployeeInput) {
  const user = await requirePermission("employees:create");
  const data = schema.parse(input);
  const payload = {
    name: data.name,
    nameAr: data.nameAr || null,
    phone: data.phone || null,
    email: data.email || null,
    role: data.role,
    branchId: data.branchId || null,
    salary: data.salary != null ? toMinor(data.salary) : null,
    hireDate: data.hireDate ? new Date(data.hireDate) : null,
    notes: data.notes || null,
    isActive: data.isActive,
  };
  if (data.id) {
    await prisma.employee.update({ where: { id: data.id }, data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "employee", data.id);
  } else {
    const created = await prisma.employee.create({ data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "employee", created.id);
  }
  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteEmployee(id: string) {
  await requirePermission("employees:edit");
  await prisma.employee.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/employees");
  return { ok: true };
}