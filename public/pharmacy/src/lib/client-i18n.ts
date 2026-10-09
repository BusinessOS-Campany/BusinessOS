import { dictionary, type Locale } from "@/lib/i18n";

export function translateKey(locale: Locale, key: string): string {
  let cur: unknown = dictionary[locale];
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      cur = undefined;
      break;
    }
  }
  if (typeof cur === "string") return cur;
  cur = dictionary.en;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      cur = undefined;
      break;
    }
  }
  return typeof cur === "string" ? cur : key;
}