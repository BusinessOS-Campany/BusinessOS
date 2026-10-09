import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { permissionsFor, type Permission, type RoleKey } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  username: string;
  name: string;
  nameAr: string | null;
  email: string;
  phone: string | null;
  role: RoleKey;
  permissions: Permission[];
  branchId: string | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session?.userId) return null;
  try {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      nameAr: user.nameAr,
      email: user.email,
      phone: user.phone,
      role: user.role as RoleKey,
      permissions: permissionsFor(user.role),
      branchId: user.branchId,
    };
  } catch {
    return null;
  }
});

export const requireAuth = cache(async (): Promise<CurrentUser> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});

export function can(user: CurrentUser | null, permission: Permission): boolean {
  if (!user) return false;
  const role = permissionsFor(user.role);
  if (role.includes("roles:manage")) return true;
  return role.includes(permission);
}

export const requirePermission = cache(async (permission: Permission) => {
  const user = await requireAuth();
  if (!can(user, permission)) redirect("/forbidden");
  return user;
});