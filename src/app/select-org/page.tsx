import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

/**
 * Per-status explanation for tenants the org gate bounced here. Hitting the
 * picker with `?status=` means a member of a pending/suspended/cancelled org
 * tried to open `/{org}/...` and was told to choose again; repeating the choice
 * only re-bounces, so the picker must both explain and make that row inert.
 */
const STATUS_BANNERS: Record<string, { emoji: string; title: string; body: string }> = {
  pending: {
    emoji: "⏳",
    title: "بانتظار موافقة المنصة",
    body: "تم إرسال طلب إنشاء هذه المؤسسة وجارٍ مراجعته من إدارة المنصة. ستصبح متاحة بمجرد الموافقة على الطلب.",
  },
  suspended: {
    emoji: "⏸",
    title: "هذه المؤسسة معلّقة",
    body: "تم تعليق المؤسسة مؤقتًا. يمكنك الاستمرار في تعديل حسابك، ولإعادة تفعيل المؤسسة تواصل مع إدارة المنصة.",
  },
  cancelled: {
    emoji: "🚫",
    title: "تم إلغاء اشتراك المؤسسة",
    body: "لا يمكن الوصول إلى هذه المؤسسة حاليًا. يرجى التواصل مع إدارة المنصة لمعرفة التفاصيل.",
  },
  rejected: {
    emoji: "🚫",
    title: "تم رفض طلب المؤسسة",
    body: "تم رفض حساب هذه المؤسسة. يرجى التواصل مع إدارة المنصة للمزيد من المعلومات.",
  },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  suspended: "معلّقة",
  cancelled: "ملغاة",
  rejected: "مرفوضة",
};

export default async function SelectOrgPage({ searchParams }: PageProps) {
  const { status } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
  });

  const banner = status ? STATUS_BANNERS[status] : null;

  return (
    <OnboardingShell>
      <main className="min-h-[calc(100vh-4rem)]" dir="rtl">
        <div className="mx-auto flex max-w-md flex-col justify-center gap-6 px-4 py-24">
          <h1 className="text-xl font-semibold text-white">اختر المؤسسة</h1>
          {banner && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 font-medium text-white">
                <span aria-hidden>{banner.emoji}</span>
                <span>{banner.title}</span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{banner.body}</p>
            </div>
          )}
          {memberships.length === 0 && (
            <p className="text-white/60">ليس لديك أي مؤسسات بعد. يمكنك إنشاء مؤسسة جديدة من لوحة التحكم.</p>
          )}
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.id}>
                <OrgRow
                  orgId={m.organizationId}
                  name={m.organization.name}
                  slug={m.organization.slug}
                  role={m.role}
                  status={m.organization.status}
                />
              </li>
            ))}
          </ul>
          {session.user.role === "admin" && (
            <Link href="/platform-admin" className="text-sm text-primary hover:text-primary/80">
              ← لوحة تحكم المنصة
            </Link>
          )}
          <Link href="/profile" className="text-sm text-primary hover:text-primary/80">
            تعديل حسابي
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            العودة
          </Link>
        </div>
      </main>
    </OnboardingShell>
  );
}

function OrgRow({
  orgId,
  name,
  slug,
  role,
  status,
}: {
  orgId: string;
  name: string;
  slug: string;
  role: string;
  status: string;
}) {
  const roleLabels: Record<string, string> = {
    owner: "المالك",
    admin: "مدير",
    manager: "مشرف",
    cashier: "محاسب",
    accountant: "محاسب",
    viewer: "مشاهد",
  };
  const usable = status === "active";

  if (usable) {
    return (
      <form action="/api/v1/organizations/activate-form" method="post" className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 backdrop-blur-xl transition-all hover:border-primary/40">
        <input type="hidden" name="organizationId" value={orgId} />
        <div className="flex-1">
          <p className="font-medium text-white">{name}</p>
          <p className="text-xs text-white/50">{slug} · {roleLabels[role] ?? role}</p>
        </div>
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90">
          دخول ←
        </button>
      </form>
    );
  }

  // A pending/suspended/cancelled org must not offer "دخول": activating it 303s
  // to /{org}/..., the layout gate bounces straight back here, an infinite loop.
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 opacity-70 backdrop-blur-xl">
      <div className="flex-1">
        <p className="font-medium text-white">{name}</p>
        <p className="text-xs text-white/50">{slug} · {roleLabels[role] ?? role}</p>
      </div>
      <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/60">
        {STATUS_LABELS[status] ?? status}
      </span>
    </div>
  );
}