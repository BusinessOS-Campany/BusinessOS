"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-shot tenant activation for subdomain logins: POSTs the tenant org to
 * the activate-form route (which sets the active-org cookie) then lands on
 * the tenant org's profile page. Mounted by /select-org when the resolved
 * host org is one of the user's memberships.
 */
export function TenantAutoActivate({
  organizationId,
  orgName,
}: {
  organizationId: string;
  orgName: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const form = new FormData();
    form.set("organizationId", organizationId);
    fetch("/api/v1/organizations/activate-form", { method: "POST", body: form })
      .then((res) => {
        if (!res.redirected && !res.ok) {
          setFailed(true);
          return;
        }
        const target = new URL(res.url).pathname + new URL(res.url).search;
        router.replace(target);
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [organizationId, router]);

  if (failed) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-center text-sm text-primary backdrop-blur-sm">
      جارٍ فتح {orgName}...
    </div>
  );
}