import type {
  ApplicationAdapter,
  AppMetadata,
  AppHealthStatus,
} from "./types";

/**
 * Application Registry — singleton registry of all application adapters.
 *
 * Applications register themselves at startup. The platform uses this
 * registry to:
 * - Enumerate available apps for the marketplace
 * - Get adapter instances for installed apps
 * - Resolve navigation, widgets, AI tools per app
 */
class ApplicationRegistry {
  private adapters = new Map<string, ApplicationAdapter>();

  /** Register an application adapter. */
  register(adapter: ApplicationAdapter): void {
    const meta = adapter.getMetadata();
    if (this.adapters.has(meta.slug)) {
      throw new Error(`Application "${meta.slug}" is already registered`);
    }
    this.adapters.set(meta.slug, adapter);
  }

  /** Get an adapter by slug. Returns undefined if not registered. */
  get(slug: string): ApplicationAdapter | undefined {
    return this.adapters.get(slug);
  }

  /** Get all registered application metadata (for marketplace). */
  getAllMetadata(): AppMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.getMetadata());
  }

  /** Get metadata for a specific app. */
  getMetadata(slug: string): AppMetadata | undefined {
    return this.adapters.get(slug)?.getMetadata();
  }

  /** Check if an app is registered. */
  has(slug: string): boolean {
    return this.adapters.has(slug);
  }

  /** Get all registered slugs. */
  getSlugs(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Get health status for all registered apps. */
  async getAllHealth(): Promise<Record<string, AppHealthStatus>> {
    const results: Record<string, AppHealthStatus> = {};
    for (const [slug, adapter] of this.adapters) {
      results[slug] = await adapter.getHealthStatus();
    }
    return results;
  }

  /** Get health status for a specific app. */
  async getHealth(slug: string): Promise<AppHealthStatus | null> {
    const adapter = this.adapters.get(slug);
    if (!adapter) return null;
    return adapter.getHealthStatus();
  }
}

/** Singleton registry instance. */
export const appRegistry = new ApplicationRegistry();
