"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

const profileSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export async function updateProfile(input: z.infer<typeof profileSchema>) {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const data = profileSchema.parse(input);
  await prisma.user.update({
    where: { id: user.id },
    data: { name: data.name, nameAr: data.nameAr || null, phone: data.phone || null },
  });
  revalidatePath("/profile");
  return { ok: true };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function changePassword(input: z.infer<typeof passwordSchema>) {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const data = passwordSchema.parse(input);

  const db = await prisma.user.findUnique({ where: { id: user.id } });
  if (!db) throw new Error("UNAUTHORIZED");
  const valid = await verifyPassword(data.currentPassword, db.passwordHash);
  if (!valid) throw new Error("WRONG_PASSWORD");

  const hash = await hashPassword(data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  await recordAudit(user.id, AUDIT_ACTIONS.PASSWORD_RESET, "user", user.id);
  return { ok: true };
}

export async function markNotificationRead(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
  revalidatePath("/notifications");
  return { ok: true };
}

export async function saveSettings(input: Record<string, unknown>) {
  await requirePermission("settings:manage");
  const current = await prisma.setting.findUnique({ where: { key: "pharmacy" } });
  const base = typeof current?.value === "object" && current.value && !Array.isArray(current.value) ? current.value : {};
  const value = { ...(base as Record<string, unknown>), ...input } as object;
  await prisma.setting.upsert({
    where: { key: "pharmacy" },
    create: { key: "pharmacy", value },
    update: { value },
  });
  revalidatePath("/settings");
  return { ok: true };
}