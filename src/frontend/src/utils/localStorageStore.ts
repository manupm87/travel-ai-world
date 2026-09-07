/**
 * A `localStorage` key exposed as an external store for `useSyncExternalStore`.
 *
 * Writes made through the store notify same-tab subscribers synchronously;
 * writes made by other tabs arrive through the browser's `storage` event.
 * Every access is guarded: storage may be unavailable (SSR, privacy mode,
 * quota errors), in which case reads return `null` and writes are dropped.
 */
export interface LocalStorageStore {
  readonly key: string;
  /** Current raw value, or `null` when absent or when storage is unavailable. */
  read(): string | null;
  /** Persists `value` and notifies subscribers. */
  write(value: string): void;
  /** Deletes the key and notifies subscribers. */
  remove(): void;
  /** Registers a change listener; returns the matching unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createLocalStorageStore(key: string): LocalStorageStore {
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    key,

    read() {
      if (typeof window === "undefined") return null;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },

    write(value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Storage full or disabled: the in-memory subscribers still get told.
      }
      emit();
    },

    remove() {
      try {
        localStorage.removeItem(key);
      } catch {
        // Nothing to remove when storage is unavailable.
      }
      emit();
    },

    subscribe(listener) {
      // `key === null` is `localStorage.clear()`, which affects us too.
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) listener();
      };
      listeners.add(listener);
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}
