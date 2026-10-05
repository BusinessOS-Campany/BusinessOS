"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const ICONS: Record<string, string> = {
  "shopping-cart": "🛒",
  "graduation-cap": "🎓",
  "utensils": "🍽️",
  "heart-pulse": "💊",
  "store": "🏪",
};

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  grocery: { ar: "بقالة / سوبرماركت", en: "Grocery / Supermarket" },
  school: { ar: "مدرسة / تعليم", en: "School / Education" },
  restaurant: { ar: "مطعم / معديات", en: "Restaurant / Food Service" },
  clinic: { ar: "عيادة / صيدلية", en: "Clinic / Pharmacy" },
  retail: { ar: "تجزئة / متجر عام", en: "Retail / General Store" },
};

interface TemplateCardProps {
  code: string;
  icon: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  modulesCount: number;
  hasActiveOrg: boolean;
}

export function TemplateCard({
  code,
  icon,
  nameAr,
  nameEn,
  descriptionAr,
  modulesCount,
  hasActiveOrg,
}: TemplateCardProps) {
  const router = useRouter();
  const cat = CATEGORY_LABELS[code];

  if (hasActiveOrg) {
    return (
      <button
        type="button"
        onClick={async () => {
          try {
            const res = await fetch("/api/v1/org/install-template", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ templateCode: code }),
            });
            const json = await res.json().catch(() => ({}));
            const target = (json?.redirectTo as string | undefined) ?? "/my-apps";
            router.push(target);
          } catch {
            router.push("/my-apps");
          }
        }}
        className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] text-right backdrop-blur-xl transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:shadow-xl hover:shadow-primary/10"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary to-primary/80 opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="flex flex-1 flex-col p-6">
          <div className="mb-4 text-4xl">{icon}</div>
          <h2 className="text-xl font-semibold text-white">{cat?.ar ?? nameAr}</h2>
          <p className="mt-1 text-sm text-white/50">{cat?.en ?? nameEn}</p>
          <p className="mt-3 flex-1 text-sm text-white/60">{descriptionAr}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-4">
            <span className="text-xs text-white/50">{modulesCount} وحدة متضمنة</span>
            <span className="text-sm font-medium text-primary group-hover:text-primary/80 transition-colors">
              تثبيت ←
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <Link
      href={`/signup?template=${code}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] text-right backdrop-blur-xl transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:shadow-xl hover:shadow-primary/10"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary to-primary/80 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4 text-4xl">{icon}</div>
        <h2 className="text-xl font-semibold text-white">{cat?.ar ?? nameAr}</h2>
        <p className="mt-1 text-sm text-white/50">{cat?.en ?? nameEn}</p>
        <p className="mt-3 flex-1 text-sm text-white/60">{descriptionAr}</p>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-4">
          <span className="text-xs text-white/50">{modulesCount} وحدة متضمنة</span>
          <span className="text-sm font-medium text-primary group-hover:text-primary/80 transition-colors">
            اختيار ←
          </span>
        </div>
      </div>
    </Link>
  );
}

interface OtherCardProps {
  hasActiveOrg: boolean;
}

export function OtherCard({ hasActiveOrg }: OtherCardProps) {
  const router = useRouter();
  if (hasActiveOrg) {
    return (
      <button
        type="button"
        onClick={() => router.push("/systems")}
        className="group flex flex-col rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-6 text-right backdrop-blur-xl transition-all hover:border-primary/50 hover:bg-white/[0.04]"
      >
        <div className="mb-4 text-4xl">📋</div>
        <h2 className="text-xl font-semibold text-white">نشاط آخر</h2>
        <p className="mt-1 text-sm text-white/50">Other Business Type</p>
        <p className="mt-3 flex-1 text-sm text-white/60">
          اختر من الأنظمة المزيد من الأنظمة الثابتة
        </p>
        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <span className="text-sm font-medium text-white/60 group-hover:text-primary transition-colors">
            الأنظمة ←
          </span>
        </div>
      </button>
    );
  }

  return (
    <Link
      href="/signup?template=custom"
      className="group flex flex-col rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-6 backdrop-blur-xl transition-all hover:border-primary/50 hover:bg-white/[0.04]"
    >
      <div className="mb-4 text-4xl">📋</div>
      <h2 className="text-xl font-semibold text-white">نشاط آخر</h2>
      <p className="mt-1 text-sm text-white/50">Other Business Type</p>
      <p className="mt-3 flex-1 text-sm text-white/60">
        ابدأ بنظام فارغ وخصصه حسب احتياجات نشاطك
      </p>
      <div className="mt-4 border-t border-white/[0.08] pt-4">
        <span className="text-sm font-medium text-white/60 group-hover:text-primary transition-colors">
          إعداد مخصص ←
        </span>
      </div>
    </Link>
  );
}
