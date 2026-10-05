"use client";

import { useCallback, useState } from "react";
import { ApiClientError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { dictionaries, t, type Locale } from "@/core/i18n/dictionaries";
import type { ProfileActivity, ProfileOverview, ProfileTab } from "@/core/profile/service";
import type { MediaKind } from "@/core/profile/media";

/**
 * Own-profile client state.
 *
 * The server already rendered `initial`, so the first paint needs no request.
 * Every mutation returns the same `ProfileOverview` shape the server produced,
 * which is why `applyOverview` can just replace state instead of patching fields
 * by hand — no chance of the header and the panels disagreeing after a save.
 */

export interface ProfilePatchInput {
  name?: string;
  username?: string | null;
  bio?: string | null;
  image?: string | null;
  coverImage?: string | null;
  socials?: Record<string, unknown>;
  extras?: Record<string, unknown>;
  preferences?: Record<string, boolean>;
  locale?: Locale;
}

export interface UploadResult {
  url: string;
  bytes: number;
  mime: string;
}

function errorMessage(locale: Locale, err: unknown): string {
  const dict = dictionaries[locale];
  if (err instanceof ApiClientError) {
    // The API is bilingual and already knows which language the app is in.
    return locale === "ar" ? err.messageAr : err.messageEn;
  }
  if (err instanceof TypeError) return t(dict, "profile.error.network");
  return t(dict, "profile.error.generic");
}

export function useProfile(
  initial: ProfileOverview | null,
  initialError: string | null,
  locale: Locale,
  initialActivity: ProfileActivity | null,
  initialActivityFailed = false,
) {
  const dict = dictionaries[locale];

  const [overview, setOverview] = useState<ProfileOverview | null>(initial);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState<MediaKind | null>(null);

  const [activity, setActivity] = useState<ProfileActivity | null>(initialActivity);
  const [activityLoading, setActivityLoading] = useState(false);
  // Seeded from the server render: if the SSR activity query failed there is no
  // data to show, and without this the panel would sit in its skeleton forever
  // because it only offers a retry inside its error branch.
  const [activityError, setActivityError] = useState<string | null>(
    initialActivityFailed ? t(dict, "profile.error.load") : null,
  );
  const [activityPage, setActivityPage] = useState(initialActivity?.page ?? 1);

  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<ProfileOverview>("/api/v1/profile");
      setOverview(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(locale, err));
    }
  }, [locale]);

  /**
   * Only ever called from event handlers (tab entry, pagination, retry), never
   * from an effect — the activity tab is server-rendered, so there is nothing
   * to fetch on mount.
   */
  const loadActivity = useCallback(
    async (page: number, append = false) => {
      setActivityLoading(true);
      setActivityError(null);
      try {
        const next = await apiGet<ProfileActivity>(`/api/v1/profile/activity?page=${page}`);
        setActivity((prev) => (append && prev ? { ...next, items: [...prev.items, ...next.items] } : next));
        setActivityPage(page);
      } catch (err) {
        setActivityError(errorMessage(locale, err));
      } finally {
        setActivityLoading(false);
      }
    },
    [locale],
  );

  const patch = useCallback(
    async (input: ProfilePatchInput): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      setSavedAt(null);
      try {
        const next = await apiPatch<ProfileOverview>("/api/v1/profile", input);
        setOverview(next);
        setSavedAt(Date.now());
        setFlash(t(dict, "profile.editor.saved"));
        return true;
      } catch (err) {
        setSaveError(errorMessage(locale, err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [locale, dict],
  );

  const checkUsername = useCallback(
    async (value: string): Promise<{ available: boolean; reason: string | null }> => {
      try {
        // HEAD carries no body by definition, so availability is a GET.
        const res = await apiGet<{ available: boolean; reason: string | null }>(
          `/api/v1/profile/username?value=${encodeURIComponent(value)}`,
        );
        return res;
      } catch {
        return { available: false, reason: "error" };
      }
    },
    [],
  );

  const upload = useCallback(
    async (kind: MediaKind, file: File): Promise<boolean> => {
      setUploading(kind);
      setSaveError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        // No Content-Type: the browser must set the multipart boundary.
        const res = await fetch(`/api/v1/profile/${kind}`, { method: "POST", body: fd, credentials: "include" });
        const json = (await res.json().catch(() => null)) as
          | { data: UploadResult }
          | { error: { code: string; messageAr: string; messageEn: string } }
          | null;
        if (!res.ok || !json || !("data" in json)) {
          const err = json && "error" in json ? json.error : null;
          setSaveError(err ? (locale === "ar" ? err.messageAr : err.messageEn) : t(dict, "profile.error.generic"));
          return false;
        }
        // The upload already wrote the column; refetch so cover/avatar and the
        // rest of the profile come from one consistent read.
        await refresh();
        return true;
      } catch {
        setSaveError(t(dict, "profile.error.network"));
        return false;
      } finally {
        setUploading(null);
      }
    },
    [locale, dict, refresh],
  );

  const removeMedia = useCallback(
    async (kind: MediaKind): Promise<boolean> => {
      setUploading(kind);
      setSaveError(null);
      try {
        // The DELETE endpoint also purges the stored bytes; a PATCH of null would
        // only clear the column and leak the object forever.
        await apiDelete(`/api/v1/profile/${kind}`);
        await refresh();
        return true;
      } catch (err) {
        setSaveError(errorMessage(locale, err));
        return false;
      } finally {
        setUploading(null);
      }
    },
    [locale, refresh],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error: string | null }> => {
      setSaving(true);
      setSaveError(null);
      try {
        await apiPost("/api/v1/profile", { currentPassword, newPassword, revokeOtherSessions: true });
        setFlash(t(dict, "profile.security.passwordChanged"));
        await refresh();
        return { ok: true, error: null };
      } catch (err) {
        return { ok: false, error: errorMessage(locale, err) };
      } finally {
        setSaving(false);
      }
    },
    [locale, dict, refresh],
  );

  /** Revoke by session *id*; the token is resolved server-side. */
  const revokeSession = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        await apiDelete("/api/v1/profile", { sessionId });
        setFlash(t(dict, "profile.security.revoked"));
        await refresh();
      } catch (err) {
        setSaveError(errorMessage(locale, err));
      }
    },
    [locale, dict, refresh],
  );

  const revokeOtherSessions = useCallback(async (): Promise<void> => {
    try {
      await apiDelete("/api/v1/profile", { revokeOthers: true });
      setFlash(t(dict, "profile.security.revokedAll"));
      await refresh();
    } catch (err) {
      setSaveError(errorMessage(locale, err));
    }
  }, [locale, dict, refresh]);

  /**
   * Rename one of THIS org's installed systems.
   *
   * The endpoint returns the whole `ProfileOverview` (the org's own name lives
   * on the `organizationApp` row the server just wrote), so state is replaced
   * wholesale — the card, the header and the org counters can never disagree
   * about what the system is called.
   */
  const renameSystem = useCallback(
    async (appId: string, displayName: string): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        const next = await apiPatch<ProfileOverview>("/api/v1/profile/systems", { appId, displayName });
        setOverview(next);
        setSavedAt(Date.now());
        setFlash(t(dict, "profile.systems.renameSaved"));
        return true;
      } catch (err) {
        setSaveError(errorMessage(locale, err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [locale, dict],
  );

  /**
   * Copies this org's copy of a system again from the master template.
   *
   * Repair, not routine: the clone is idempotent, so for a healthy org this
   * returns the same count and writes nothing. It is here because the endpoint
   * existed with no way to reach it — an admin whose files were damaged had no
   * action available for it.
   */
  const reCloneSystem = useCallback(
    async (appId: string): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        const result = await apiPost<{ cloned: boolean; fresh: boolean; files: number }>(
          "/api/v1/profile/systems",
          { appId },
        );
        setFlash(
          result.fresh
        ? t(dict, "profile.systems.reCloneDone")
        : t(dict, "profile.systems.reCloneUnchanged"),
        );
        return true;
      } catch (err) {
        setSaveError(errorMessage(locale, err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [locale, dict],
  );

  /**
   * Turns on direct sign-in for one system, by re-confirming the member's
   * platform password.
   *
   * The password is verified against the platform's own credential store before
   * anything is stored, so this can only ever copy a password the member already
   * holds — it is not a way to set a new login in a customer's system.
   */
  const confirmSystemCredential = useCallback(
    async (appId: string, currentPassword: string): Promise<{ ok: boolean; error: string | null }> => {
      setSaving(true);
      setSaveError(null);
      try {
        await apiPut("/api/v1/profile/systems", { appId, currentPassword });
        setFlash(t(dict, "profile.systems.credentialReady"));
        // The stored digest lives on the server; refetch so the access row shows
        // the username the member must type.
        await refresh();
        return { ok: true, error: null };
      } catch (err) {
        return { ok: false, error: errorMessage(locale, err) };
      } finally {
        setSaving(false);
      }
    },
    [locale, dict, refresh],
  );

  return {
    dict,
    overview,
    setOverview,
    loadError,
    saving,
    saveError,
    savedAt,
    uploading,
    activity,
    activityLoading,
    activityError,
    activityPage,
    flash,
    setFlash,
    refresh,
    loadActivity,
    patch,
    checkUsername,
    upload,
    removeMedia,
    changePassword,
    revokeSession,
    revokeOtherSessions,
    renameSystem,
    reCloneSystem,
    confirmSystemCredential,
  };
}

export type ProfileController = ReturnType<typeof useProfile>;
export type { ProfileTab };
