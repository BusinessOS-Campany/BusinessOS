import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getEnv } from "@/core/config/env";

/**
 * Storage abstraction. Local filesystem implementation today; S3-ready
 * interface for future use. All paths are relative to STORAGE_PATH.
 *
 * Every method is async and uses `node:fs/promises` rather than the sync calls.
 * These run inside request handlers, and `readFileSync` on a multi-megabyte
 * cover stalls the whole event loop — i.e. every other in-flight request — for
 * the duration of the read.
 */
export interface StorageProvider {
  write(relativePath: string, data: Buffer): Promise<string>;
  read(relativePath: string): Promise<Buffer>;
  delete(relativePath: string): Promise<void>;
  /**
   * Size and mtime, or null when the key is absent.
   *
   * Returns null rather than throwing, unlike the operations above: this is a
   * query a caller makes against several candidate keys, where "not there" is
   * the normal answer and not an error worth a stack trace. Serving a cached
   * validator needs these two fields without reading the bytes.
   */
  stat(relativePath: string): Promise<{ size: number; mtimeMs: number } | null>;
  /** Returns an absolute URL or path for the given relative path. */
  getUrl(relativePath: string): string;
}

class LocalStorage implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = getEnv().STORAGE_PATH;
  }

  private resolve(relativePath: string): string {
    return join(this.basePath, relativePath);
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const fullPath = this.resolve(relativePath);
    const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(fullPath), { recursive: true });
    try {
      await writeFile(tmpPath, data);
      try {
        await require("node:fs/promises").rename(tmpPath, fullPath);
      } catch (err: any) {
        if (err && err.code === "EXDEV") {
          await require("node:fs/promises").copyFile(tmpPath, fullPath);
          try {
            await require("node:fs/promises").unlink(tmpPath);
          } catch {}
        } else {
          throw err;
        }
      }
      return relativePath;
    } catch (err) {
      try {
        await require("node:fs/promises").unlink(tmpPath);
      } catch {}
      throw err;
    }
  }

  async read(relativePath: string): Promise<Buffer> {
    const fullPath = this.resolve(relativePath);
    try {
      return await readFile(fullPath);
    } catch {
      throw new Error(`Storage: file not found: ${relativePath}`);
    }
  }

  async delete(relativePath: string): Promise<void> {
    // `force` makes an absent file a no-op, matching the old existsSync guard.
    await rm(this.resolve(relativePath), { force: true });
  }

  async stat(relativePath: string): Promise<{ size: number; mtimeMs: number } | null> {
    try {
      const info = await stat(this.resolve(relativePath));
      return { size: info.size, mtimeMs: info.mtimeMs };
    } catch {
      return null;
    }
  }

  getUrl(relativePath: string): string {
    return join(this.basePath, relativePath);
  }
}

// Singleton
let _instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!_instance) {
    _instance = new LocalStorage();
  }
  return _instance;
}

/** Override the storage provider (for testing or future S3 impl). */
export function setStorage(provider: StorageProvider): void {
  _instance = provider;
}
