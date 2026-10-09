"use client";

import { LogOut, User } from "lucide-react";
import { useLocale } from "@/components/providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function UserMenu({ userName, userRoleAr }: { userName: string; userRoleAr: string }) {
  const { locale } = useLocale();
  const router = useRouter();

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function logout() {
    const res = await fetch("/pharmacy/api/auth/logout", { method: "POST" });
    if (res.ok) {
      router.push("/login");
      router.refresh();
    } else {
      toast.error(locale === "ar" ? "تعذر تسجيل الخروج" : "Logout failed");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-1 outline-none">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm">{userName}</span>
            <span className="text-xs font-normal text-muted-foreground">{userRoleAr}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <User />
          {locale === "ar" ? "الملف الشخصي" : "Profile"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
          <LogOut />
          {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}