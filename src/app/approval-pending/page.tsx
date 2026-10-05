import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

/**
 * Shows a self-registered user that their tenant account is awaiting (or was
 * denied) platform approval. Reached from select-org / activate-form when the
 * organization status is pending or rejected.
 */
export default async function ApprovalPendingPage({ searchParams }: PageProps) {
  const { status } = await searchParams;

  return (
    <OnboardingShell>
      <main className="relative z-10 flex items-center justify-center px-4 py-24" dir="rtl">
        <div className="w-full max-w-[440px]">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
            <div className="relative">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-3xl">
                {status === "rejected" ? "🚫" : "⏳"}
              </div>
              <h1 className="text-xl font-bold text-white">
                {status === "rejected" ? "تم رفض طلب المؤسسة" : "بانتظار موافقة المنصة"}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/50">
                {status === "rejected"
                  ? "تم رفض حساب مؤسستك. يرجى التواصل مع إدارة المنصة للمزيد من المعلومات."
                  : "تم إرسال طلب إنشاء المؤسسة، وجارٍ مراجعته من إدارة المنصة. ستصبح مؤسستك متاحة بمجرد الموافقة على طلبك، وستحتاج إلى إعادة الدخول بعد ذلك."}
              </p>
              <a
                href="/signin"
                className="mt-6 inline-block text-sm text-primary/80 transition-colors hover:text-primary"
              >
                العودة إلى تسجيل الدخول
              </a>
            </div>
          </div>
        </div>
      </main>
    </OnboardingShell>
  );
}