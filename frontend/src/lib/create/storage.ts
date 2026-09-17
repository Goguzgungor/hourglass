//
// Minimal storage abstraction so pure modules can be tested with an in-memory
// store, and so a browser with blocked storage (private mode, quota) degrades
// to "read-only presets" instead of throwing into the UI.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns the browser storage if it is usable, else `null`. Never throws. */
export function safeStorage(kind: 'local' | 'session'): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__hourglass_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJson<T>(storage: StorageLike | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}
