import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";
import { useLocale } from "@/components/providers";
import { LANG_COOKIE, locales, localeName } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LocaleSwitcher() {
  const { locale } = useLocale();
  const router = useRouter();

  function switchLocale(next: string) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Language">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={locale === "ar" ? "end" : "start"}>
        {locales.map((l) => (
          <DropdownMenuItem key={l} onClick={() => switchLocale(l)}>
            {localeName[l]}
            {l === locale ? " ✓" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}