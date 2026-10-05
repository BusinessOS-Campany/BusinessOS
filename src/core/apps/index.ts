export type {
  ApplicationAdapter,
  AppMetadata,
  AppCapabilities,
  AppNavItem,
  AppDashboardWidget,
  AppAITool,
  AppHealthStatus,
  AppInstallStatus,
  OrganizationApp,
} from "./types";

export { appMetadataSchema, installAppSchema } from "./types";

export {
  orgSystemDisplayName,
  parseOrgSystemDisplayName,
  withOrgSystemDisplayName,
  SYSTEM_NAME_MAX,
} from "./settings";

export { appRegistry } from "./registry";

export { registerAllApps } from "./init";

export {
  getOrganizationApps,
  getOrganizationApp,
  isAppActive,
  installApp,
  updateAppStatus,
  uninstallApp,
  updateAppConfiguration,
  getAvailableApps,
  registerAppsInDb,
} from "./service";
