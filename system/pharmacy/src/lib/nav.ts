import "server-only";
import { NAV_GROUPS } from "@/lib/nav-config";
import { translate } from "@/lib/i18n";
import type { CurrentUser } from "@/lib/dal";
import { can } from "@/lib/dal";

export function navForUser(user: CurrentUser | null, locale: "ar" | "en") {
  return NAV_GROUPS.map((group) => ({
    label: translate(locale, group.labelKey),
    key: group.labelKey,
    items: group.items
      .filter((item) => !item.permission || can(user, item.permission))
      .map((item) => ({
        labelKey: item.labelKey,
        href: item.href,
        icon: item.icon,
        label: translate(locale, item.labelKey),
      })),
  })).filter((g) => g.items.length > 0);
}