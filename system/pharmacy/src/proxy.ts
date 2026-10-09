import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt, encrypt, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await decrypt(token);

  const isAuthPage =
    pathname === "/login" ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  if (isAuthPage && session?.userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (!isAuthPage && !session?.userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (session?.userId && token) {
    const refreshed = await encrypt({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
    });
    res.cookies.set(SESSION_COOKIE, refreshed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};