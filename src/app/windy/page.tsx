"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

const WindyPreview = dynamic(() => import("@/components/landing/windy-preview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-white/50">
      تحميل المشهد…
    </div>
  ),
});

function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function WindyPage() {
  const mounted = useIsMounted();
  if (!mounted) return null;

  return (
    <OnboardingShell>
      <main className="relative flex flex-col items-center justify-center overflow-hidden" dir="ltr">
        <div className="relative z-10 h-[70vh] w-full max-w-5xl">
          <WindyPreview />
        </div>
        <div className="relative z-10 max-w-2xl px-6 pt-4 pb-10 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">A Windy Day</h1>
          <p className="mt-2 text-sm text-white/60">
            لقطات من «يوم عاصف» للفنان Loïc Norgeot — إعادة إنشاء إجرائية لرياح
            الأرض وهطول الأمطار. تدور الجزيئات الملونة (بمقياس الألوان inferno)
            حول الكوكب بنمط إنسيابي، مع أمطار زرقاء باردة فوق المناطق المنخفضة.
          </p>
          <p className="mt-4 text-xs text-white/40">
            اسحب الكرة للتدوير · لا يتم تحميل نموذج Sketchfab (يحتاج رمز API)
          </p>
        </div>
      </main>
    </OnboardingShell>
  );
}
