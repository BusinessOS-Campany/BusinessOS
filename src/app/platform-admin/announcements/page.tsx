import { prisma } from "@/core/db/client";
import { AnnouncementForm } from "./announcement-form";

export default async function AnnouncementsPage() {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Announcements</h1>

      <AnnouncementForm />

      <div className="space-y-3">
        {announcements.map((a) => (
          <article key={a.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2">
              <span
                className={
                  a.severity === "critical"
                    ? "rounded-full bg-red-900/60 px-2 py-0.5 text-xs text-red-300"
                    : a.severity === "warning"
                      ? "rounded-full bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300"
                      : "rounded-full bg-sky-900/60 px-2 py-0.5 text-xs text-sky-300"
                }
              >
                {a.severity}
              </span>
              <h2 className="font-medium">{a.titleEn}</h2>
              <span className="text-xs text-neutral-500">{a.titleAr}</span>
              {!a.publishedAt && (
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">draft</span>
              )}
            </div>
            <p className="mt-1 text-sm text-neutral-400">{a.bodyEn}</p>
            <p className="text-sm text-neutral-400">{a.bodyAr}</p>
            <p className="mt-2 text-xs text-neutral-600">
              audience: {a.audience} · created {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
