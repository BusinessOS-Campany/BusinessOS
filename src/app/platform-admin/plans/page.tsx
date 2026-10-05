import { prisma } from "@/core/db/client";
import type { Prisma } from "@/core/db/generated/prisma/client";

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Plans</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const limits = p.limits as Prisma.JsonObject;
          return (
            <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">{p.nameEn}</h2>
                <span className="text-xs text-neutral-400">{p.nameAr}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {(Number(p.priceMonthlyMinor) / 100).toFixed(2)}
                <span className="text-sm font-normal text-neutral-400"> {p.currency}/mo</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-neutral-400">
                <li>Users: {String(limits.users ?? "—")}</li>
                <li>Branches: {String(limits.branches ?? "—")}</li>
                <li>AI credits/mo: {String(limits.aiCreditsPerMonth ?? "—")}</li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
