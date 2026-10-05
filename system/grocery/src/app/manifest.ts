import type { MetadataRoute } from "next";
import { dict } from "@/shared/i18n";
import { buildPwaManifest } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  const t = dict();
  return buildPwaManifest(process.env.SYSTEM_BASE_PATH ?? "/grocery", {
    storeName: t.auth.storeName,
    appName: t.common.appName,
  });
}