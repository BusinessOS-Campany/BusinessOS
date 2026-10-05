"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the tenant shell. Catches render errors from any page
 * under /app so the user gets a recoverable screen instead of a blank tab.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-96 items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-2xl">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-foreground">تعذّر عرض هذه الصفحة</h1>
        <p className="text-sm text-muted-foreground">
          حدث خطأ غير متوقع أثناء عرض الصفحة. جرّب إعادة التحميل، وإن استمر المشكلة
          فتواصل مع الدعم.
        </p>
        <Button onClick={reset} className="bg-primary text-white hover:bg-primary/80">
          إعادة المحاولة
        </Button>
      </div>
    </div>
  );
}