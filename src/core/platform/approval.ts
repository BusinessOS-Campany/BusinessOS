/**
 * Platform approval of self-registered tenants. A tenant created through
 * /api/v1/public/signup (or the social /auth/complete-org flow) starts in
 * "pending" — the requesting owner cannot use any app until a platform admin
 * approves the account from /platform-admin/approvals, which grants the
 * apps, plan and owner role explicitly.
 */

/** Organization lifecycle statuses understood by the platform. */
export const ORG_STATUS = {
  /** Awaiting platform approval after self-registration. */
  PENDING: "pending",
  /** Approved — apps granted, tenant usable. */
  ACTIVE: "active",
  /** Rejected by a platform admin at the approval step. */
  REJECTED: "rejected",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
} as const;

/** Maps an industry template code to the app slug it should provision. */
const TEMPLATE_APP_MAP: Record<string, string> = {
  grocery: "grocery",
  clinic: "sama-center",
};

/** Default plan assigned when an admin approves without picking one. */
export const DEFAULT_APPROVAL_PLAN = "trial";

/** Default owner role granted on approval. */
export const DEFAULT_APPROVAL_ROLE = "owner";

/** App slug the given template would normally need ("" when none). */
export function suggestedAppForTemplate(templateCode: string | null | undefined): string {
  return templateCode ? (TEMPLATE_APP_MAP[templateCode] ?? "") : "";
}

/** True when a tenant is usable by its members. */
export function isUsableStatus(status: string): boolean {
  return status === ORG_STATUS.ACTIVE;
}