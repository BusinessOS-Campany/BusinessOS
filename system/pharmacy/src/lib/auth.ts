import "server-only";
import { cookies } from "next/headers";
import {
  decrypt,
  encrypt,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type SessionPayload,
} from "@/lib/session";

export type { SessionPayload };
export { SESSION_COOKIE, decrypt, encrypt };

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  return decrypt(value);
}

export async function setSessionCookie(payload: SessionPayload) {
  const cookieStore = await cookies();
  const token = await encrypt(payload);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return token;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}