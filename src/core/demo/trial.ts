export const DEMO_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export type DemoSystem = "store" | "grocery" | "clinic";

export interface DemoTrial {
  startedAt: string;
  system: DemoSystem;
}

const STORAGE_KEY = "bos_demo_trial";

type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

/** Referentially-stable cache so useSyncExternalStore snapshots don't churn. */
let cache: DemoTrial | null | undefined;

function emitChange(): void {
  cache = undefined;
  subscribers.forEach((fn) => fn());
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Subscribes to trial changes (for useSyncExternalStore). */
export function subscribeDemoTrial(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * Reads the stored demo trial from localStorage. Returns null when
 * absent/invalid. Cached so the value is referentially stable between reads.
 */
export function readDemoTrial(): DemoTrial | null {
  if (cache !== undefined) return cache;
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoTrial>;
    if (typeof parsed.startedAt !== "string" || typeof parsed.system !== "string") return null;
    cache = { startedAt: parsed.startedAt, system: parsed.system as DemoSystem };
  } catch {
    cache = null;
  }
  return cache;
}

/** Starts a new 3-day demo trial for the chosen system (keeps an active one). */
export function startDemoTrial(system: DemoSystem): DemoTrial {
  const existing = readDemoTrial();
  if (existing && !isDemoExpired(existing)) return existing;

  const trial: DemoTrial = { startedAt: new Date().toISOString(), system };
  if (isBrowser()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trial));
  cache = trial;
  emitChange();
  return trial;
}

/** Resets the stored trial (used to seed a fresh demo during development). */
export function clearDemoTrial(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  emitChange();
}

export function demoExpiresAt(trial: DemoTrial): Date {
  return new Date(new Date(trial.startedAt).getTime() + DEMO_DURATION_MS);
}

export function isDemoExpired(trial: DemoTrial, now: Date = new Date()): boolean {
  // Policy 2026-09-25: demos are always open — trials never expire.
  void trial;
  void now;
  return false;
}

/** Milliseconds remaining until the trial ends (always the full duration — never expires). */
export function demoRemainingMs(trial: DemoTrial, now: Date = new Date()): number {
  void trial;
  void now;
  return DEMO_DURATION_MS;
}

/** Returns { days, hours } remaining (ceil so day 3 counts as a full day). */
export function demoRemainingParts(trial: DemoTrial, now: Date = new Date()): { days: number; hours: number } {
  const remaining = demoRemainingMs(trial, now);
  if (remaining <= 0) return { days: 0, hours: 0 };
  const totalHours = Math.ceil(remaining / (60 * 60 * 1000));
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}