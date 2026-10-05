"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { clearSessionCookie, setSessionCookie } from "@/lib/auth"
import { logAudit } from "@/lib/audit"

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(120),
  password: z.string().min(1),
})

export type LoginState = {
  error: "invalid_credentials" | "account_disabled" | null
}

function safeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null
  if (!value.startsWith("/")) return null
  if (value.startsWith("//")) return null
  return value
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: "invalid_credentials" }
  }

  const { username, password } = parsed.data
  const next = safeNextPath(formData.get("next"))

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      branchId: true,
      isDentist: true,
      isActive: true,
      role: { select: { key: true } },
    },
  })

  if (!user) return { error: "invalid_credentials" }
  if (!user.isActive) return { error: "account_disabled" }

  const valid = await compare(password, user.passwordHash)
  if (!valid) return { error: "invalid_credentials" }

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role.key,
    branchId: user.branchId,
    isDentist: user.isDentist,
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await logAudit({
    userId: user.id,
    action: "LOGIN",
    module: "Auth",
  })

  redirect(next ?? "/dashboard")
}

export async function logoutAction() {
  await clearSessionCookie()
  redirect("/login")
}