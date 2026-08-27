import type { AppData, ThemeChoice } from "@/lib/types";
import { hydrate, serialize } from "./migrate";

/**
 * Local storage.
 *
 * The app is offline-first: `localStorage` is the primary store and Firestore
 * is a sync layer on top of it. Everything here is wrapped, because storage
 * throws in private windows and when a quota is hit, and losing a grade to an
 * unhandled `QuotaExceededError` would be unforgivable.
 */

const KEY = "gpa-dashboard:v3";
export const THEME_KEY = "gpa-dashboard:theme";

/** The single-file build that preceded this one. Read once, then superseded. */
const LEGACY_KEY = "fouryears:v1";

let memoryFallback: string | null = null;
let storageWorks = true;

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    storageWorks = false;
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    storageWorks = false;
    return false;
  }
}

/** True once a write has failed — the UI says "this session only" when so. */
export const localStorageAvailable = (): boolean => storageWorks;

export interface LoadResult {
  data: AppData;
  /** Whether anything was actually found, as opposed to a fresh default. */
  found: boolean;
  /** Whether it came from the previous single-file build. */
  migrated: boolean;
}

export function loadLocal(): LoadResult {
  const current = readRaw(KEY) ?? memoryFallback;
  if (current) {
    try {
      return { data: hydrate(JSON.parse(current)), found: true, migrated: false };
    } catch {
      /* corrupt JSON falls through to the legacy check, then to defaults */
    }
  }

  // Carry a student across from the previous build rather than greeting them
  // with an empty transcript.
  const legacy = readRaw(LEGACY_KEY);
  if (legacy) {
    try {
      const data = hydrate(JSON.parse(legacy));
      if (data.courses.length > 0) return { data, found: true, migrated: true };
    } catch {
      /* ignore */
    }
  }

  return { data: hydrate(null), found: false, migrated: false };
}

export function saveLocal(data: AppData): boolean {
  const json = JSON.stringify(serialize(data));
  memoryFallback = json;
  return writeRaw(KEY, json);
}

export function clearLocal(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  memoryFallback = null;
}

/* -------------------------------------------------------------------------- */
/* Theme — stored separately so the pre-paint script can read it synchronously */
/* -------------------------------------------------------------------------- */

export function loadTheme(): ThemeChoice | null {
  const raw = readRaw(THEME_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}

export function saveTheme(choice: ThemeChoice): void {
  writeRaw(THEME_KEY, choice);
}
