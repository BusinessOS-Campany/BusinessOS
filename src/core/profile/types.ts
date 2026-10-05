import type { Preferences, ProfileExtras, Socials } from "./normalize";

/**
 * Wire types for the profile surface.
 *
 * Deliberately free of any server import: the client bundle imports this module
 * for its types, and `service.ts` (which pulls in Prisma and Better Auth) must
 * never end up in that graph. Both the API routes and the React components
 * speak exactly these shapes.
 */

export type ProfileTab = "overview" | "activity" | "organizations" | "systems" | "security";

export const PROFILE_TABS: readonly ProfileTab[] = ["overview", "activity", "organizations", "systems", "security"];

export function parseProfileTab(raw: string | null | undefined): ProfileTab {
  return PROFILE_TABS.includes(raw as ProfileTab) ? (raw as ProfileTab) : "overview";
}

export interface ProfileIdentity {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string | null;
  handle: string | null;
  email: string | null;
  emailVerified: boolean;
  /** What a human should see: the real email, or the phone for phone accounts. */
  displayIdentifier: string;
  /** True when the account signs in with a phone number rather than an email. */
  isPhoneAccount: boolean;
  phone: string | null;
  phoneInternational: string | null;
  countryCode: string | null;
  countryNameAr: string | null;
  countryNameEn: string | null;
  image: string | null;
  coverImage: string | null;
  bio: string | null;
  jobTitle: string | null;
  location: string | null;
  city: string | null;
  locale: string;
  /** Platform-console role only; tenant roles live on the membership. */
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  /** True when the current session was touched in the last 5 minutes. */
  online: boolean;
  socials: Socials;
  extras: ProfileExtras;
  preferences: Preferences;
}

export type ProfileStatKey = "organizations" | "systems" | "sessions" | "activity";

export interface ProfileStat {
  key: ProfileStatKey;
  value: number;
}

export interface ProfileOrg {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  status: string;
  role: string;
  joinedAt: string;
  systemCount: number;
  memberCount: number;
  planName: string | null;
  planCode: string | null;
  isOwner: boolean;
}

export interface ProfileSystem {
  id: string;
  name: string;
  nameAr: string | null;
  /** The ORG's own name for this install, when it has renamed it. Wins over
   *  `name`/`nameAr` on the card, so one customer can call its copy of the
   *  grocery system anything without touching the shared catalog. */
  displayName: string | null;
  slug: string;
  icon: string | null;
  category: string;
  description: string | null;
  descriptionAr: string | null;
  routePrefix: string;
  /** Resolved open route (`routePrefix || openRouteForSlug`) — null when the
   *  system has no reachable URL, in which case the card is not a link. */
  route: string | null;
  version: string;
  status: string;
  organizationId: string;
  organizationName: string;
  installedAt: string;
  /**
   * How this member signs in to this org's copy of the system.
   *
   * `gateway` is the pre-mirror behaviour and is still the only option for a
   * social login, since there is no password to copy. `password` means the
   * member's own platform password also works on the system's own login screen —
   * `username` is then the literal string they type there.
   */
  access: ProfileSystemAccess;
}

export interface ProfileSystemAccess {
  mode: "gateway" | "password";
  /** Null until `mode` is `password`. This is what they type on the system's login. */
  username: string | null;
  /** True when the digest is stored AND delivered into the clone's database. */
  ready: boolean;
  syncedAt: string | null;
  /**
   * True when this account has no password to mirror at all (social login), which
   * is a permanent state rather than something to offer a "fix" for.
   */
  unavailableReason: "social_login" | null;
}

/** A platform-approval request the active org is waiting on. */
export interface ProfilePendingSystem {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  requestedAt: string;
}

/**
 * The active organization's add-system affordance. Only present on
 * `/{org}/profile`: `/profile` renders the same tab without an org scope, so it
 * lists the user's installed systems but offers no add button. Adding a system
 * is a single button that opens the org's marketplace chooser
 * (`/{org}/my-apps`) — the catalog page is where systems get picked; the queue
 * below lists what the platform admin is already reviewing for this org.
 */
export interface ProfileOrgContext {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  pending: ProfilePendingSystem[];
}

export interface ProfileSessionView {
  id: string;
  current: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ProfileOverview {
  identity: ProfileIdentity;
  stats: ProfileStat[];
  organizations: ProfileOrg[];
  systems: ProfileSystem[];
  sessions: ProfileSessionView[];
}

export interface ActivityDay {
  /** YYYY-MM-DD in UTC. */
  date: string;
  count: number;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  at: string;
  organizationName: string | null;
}

export interface ProfileActivity {
  days: ActivityDay[];
  total: number;
  maxDay: number;
  currentStreak: number;
  longestStreak: number;
  busiest: ActivityDay | null;
  items: ActivityItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}
