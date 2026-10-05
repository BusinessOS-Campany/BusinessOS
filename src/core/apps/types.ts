import { z } from "zod";

// ── Application Adapter Interface ──────────────────────────────────────────
// Every application integrated into Business OS must implement this interface.
// The adapter provides a standardized way for the platform to interact with
// the application's metadata, capabilities, navigation, and tools.

/** Capability flags that declare what the application supports. */
export interface AppCapabilities {
  offlineSupported: boolean;
  syncSupported: boolean;
  barcodeSupported: boolean;
  printingSupported: boolean;
  cameraSupported: boolean;
  [key: string]: boolean;
}

/** Navigation item for the application sidebar. */
export interface AppNavItem {
  name: string;
  nameAr?: string;
  href: string;
  icon: string;
  permission?: string;
  children?: AppNavItem[];
}

/** Dashboard widget definition provided by the application. */
export interface AppDashboardWidget {
  id: string;
  type: "kpi" | "chart" | "table" | "list" | "custom";
  title: string;
  titleAr?: string;
  /** Module permission required to see this widget */
  permission?: string;
  /** Widget-specific configuration */
  config: Record<string, unknown>;
  /** Default grid position */
  defaultPosition: { x: number; y: number; w: number; h: number };
}

/** AI tool definition exposed by the application. */
export interface AppAITool {
  name: string;
  description: string;
  descriptionAr?: string;
  /** Permission required to use this tool */
  permission?: string;
  /** Zod schema for tool parameters */
  parametersSchema: z.ZodType;
  /** Whether this tool performs write operations (requires confirmation) */
  isMutating: boolean;
}

/** Health status of the application. */
export interface AppHealthStatus {
  status: "healthy" | "degraded" | "unavailable";
  message?: string;
  lastChecked: Date;
}

/**
 * Application Adapter — the contract every application must implement.
 *
 * The platform uses this interface to:
 * 1. Register the app in the marketplace
 * 2. Render navigation in the app shell
 * 3. Provide dashboard widgets
 * 4. Expose AI tools
 * 5. Check health
 * 6. Validate permissions
 */
export interface ApplicationAdapter {
  /** Get application metadata for the registry */
  getMetadata(): AppMetadata;

  /** Get capability flags */
  getCapabilities(): AppCapabilities;

  /** Get navigation items for the sidebar */
  getNavigation(): AppNavItem[];

  /** Get permission strings this app uses */
  getPermissions(): string[];

  /** Get dashboard widget definitions */
  getDashboardWidgets(): AppDashboardWidget[];

  /** Get AI tool definitions */
  getAITools(): AppAITool[];

  /** Get app-specific settings schema (Zod) */
  getSettingsSchema(): z.ZodType | null;

  /** Get current health status */
  getHealthStatus(): Promise<AppHealthStatus>;
}

/** Application metadata stored in the `app` table. */
export interface AppMetadata {
  slug: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  description?: string;
  descriptionAr?: string;
  icon?: string;
  category: "business" | "healthcare" | "education" | "finance" | "other";
  version: string;
  routePrefix: string;
  capabilities: AppCapabilities;
  permissions: string[];
  navigation: AppNavItem[];
  dashboardWidgets?: AppDashboardWidget[];
  aiTools?: AppAITool[];
  configurationSchema?: unknown;
}

// ── Application Status ─────────────────────────────────────────────────────

export type AppInstallStatus = "installed" | "active" | "disabled" | "suspended";

/** Represents an app as installed by an organization. */
export interface OrganizationApp {
  id: string;
  organizationId: string;
  appId: string;
  status: AppInstallStatus;
  version: string;
  configuration?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  installedAt: Date;
  activatedAt?: Date;
  disabledAt?: Date;
}

// ── Validation Schemas ─────────────────────────────────────────────────────

export const appMetadataSchema = z.object({
  slug: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  nameAr: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  descriptionAr: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  category: z.enum(["business", "healthcare", "education", "finance", "other"]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  routePrefix: z.string().startsWith("/"),
  capabilities: z.object({
    offlineSupported: z.boolean(),
    syncSupported: z.boolean(),
    barcodeSupported: z.boolean(),
    printingSupported: z.boolean(),
    cameraSupported: z.boolean(),
  }),
  permissions: z.array(z.string()),
  navigation: z.array(z.object({
    name: z.string(),
    nameAr: z.string().optional(),
    href: z.string(),
    icon: z.string(),
    permission: z.string().optional(),
  })),
});

export const installAppSchema = z.object({
  appId: z.string(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});
