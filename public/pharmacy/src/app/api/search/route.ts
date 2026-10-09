import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, can } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { searchGroups } from "@/lib/search-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "search:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  const groups = await searchGroups(q, locale);
  return NextResponse.json({ groups });
}