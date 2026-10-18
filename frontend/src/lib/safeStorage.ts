/**
 * `localStorage` that never throws. Blocked site data, private mode and a full quota all throw on access; every caller
 * here treats storage as a convenience, so a failed read is `null` and a failed write is dropped.
 */

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Applies for this session; just won't survive a reload.
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing was stored, then.
  }
}

/** The parsed value, or `null` when the key is missing, storage is blocked, or the text is not JSON. */
export function getJSON(key: string): unknown {
  const raw = getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function setJSON(key: string, value: unknown): void {
  setItem(key, JSON.stringify(value));
}
