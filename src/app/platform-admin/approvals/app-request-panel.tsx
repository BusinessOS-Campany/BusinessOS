"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";

interface RequestRow {
  id: string;
  orgName: string;
  orgSlug: string;
  appName: string;
  appNameAr: string | null;
  appSlug: string;
  requestedByName: string;
  requestedByEmail: string;
  createdAt: string;
  status: "pending" | "rejected";
  rejectReason: string | null;
  note: string | null;
}

/** Approves/rejects a tenant's request to install an additional system. */
export function AppRequestPanel({
  req,
  dict,
  locale,
}: {
  req: RequestRow;
  dict: Dictionary;
  locale: Locale;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/app-requests/${req.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: comment.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: { messageEn?: string; messageAr?: string };
      };
      if (!res.ok) {
        throw new Error(json.error?.messageAr ?? json.error?.messageEn ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-medium">{req.orgName}</h3>
            <span className="font-mono text-xs text-neutral-500">@{req.orgSlug}</span>
            {req.status === "rejected" && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                {t(dict, "platform.appRequests.rejected")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {t(dict, "platform.appRequests.app")}:{" "}
            <span className="text-neutral-200">{req.appNameAr ?? req.appName}</span>
            <span className="font-mono text-neutral-500"> ({req.appSlug})</span>
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {t(dict, "platform.appRequests.by")} {req.requestedByName} &lt;{req.requestedByEmail}&gt; ·{" "}
            {new Date(req.createdAt).toLocaleString(locale)}
          </p>
          {req.status === "rejected" && req.rejectReason && (
            <p className="mt-1 rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1 text-xs text-red-300">
              {t(dict, "platform.appRequests.rejectReason")}: {req.rejectReason}
            </p>
          )}
          {req.note && <p className="mt-1 text-xs text-neutral-500">“{req.note}”</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            disabled={busy}
            onClick={() => void decide("reject")}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-red-800 hover:text-red-300 disabled:opacity-50"
          >
            {t(dict, "platform.appRequests.reject")}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (showComment && comment.trim()) {
                void decide("approve");
              } else {
                setShowComment(true);
              }
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {req.status === "rejected"
              ? t(dict, "platform.appRequests.reapprove")
              : t(dict, "platform.appRequests.approve")}
          </button>
        </div>
      </div>

      {showComment && (
        <div className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3 sm:flex-row sm:items-end">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(dict, "platform.appRequests.comment")}
            className="min-h-[44px] flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={busy}
            onClick={() => void decide("approve")}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {busy
              ? t(dict, "platform.appRequests.saving")
              : req.status === "rejected"
                ? t(dict, "platform.appRequests.reapprove")
                : t(dict, "platform.appRequests.approve")}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}