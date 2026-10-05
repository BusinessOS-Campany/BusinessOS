import { appRegistry } from "./registry";
import { GroceryAdapter } from "./adapters/grocery";
import { SamaCenterAdapter } from "./adapters/sama-center";

/**
 * Register all application adapters with the platform registry.
 * Called once at application startup.
 */
export function registerAllApps(): void {
  if (appRegistry.has("grocery")) return; // already registered (HMR safe)

  appRegistry.register(new GroceryAdapter());
  appRegistry.register(new SamaCenterAdapter());
}
