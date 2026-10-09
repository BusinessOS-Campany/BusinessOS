"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Laptop, Moon, Sun } from "lucide-react";
import { useLocale } from "@/components/providers";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { locale } = useLocale();

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const items = [
    { key: "light", label: locale === "ar" ? "فاتح" : "Light", Icon: Sun },
    { key: "dark", label: locale === "ar" ? "داكن" : "Dark", Icon: Moon },
    { key: "system", label: locale === "ar" ? "النظام" : "System", Icon: Laptop },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          {resolvedTheme === "dark" ? <Moon className="h-[1.2rem] w-[1.2rem]" /> : <Sun className="h-[1.2rem] w-[1.2rem]" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map(({ key, label, Icon }) => (
          <DropdownMenuItem key={key} onClick={() => setTheme(key)}>
            <Icon className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}