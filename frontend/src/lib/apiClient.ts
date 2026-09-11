// No .env file required for local dev — override by setting VITE_API_BASE_URL
// in a .env file at the frontend/ root if the backend isn't where dev expects.
// The API lives under /api so it doesn't collide with the app's own routes
// (/albums, /search, /health are both); the container builds this as "/api",
// which makes every request same-origin.
//
// The default is relative for that same reason: Vite proxies /api to the
// backend in dev, so the app works from any device that can reach the dev
// server. An absolute localhost default would send a phone to its own machine.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const TOKEN_STORAGE_KEY = 'brainlessmusic.token';

// Proof that this browser answered the admin numpad. `sessionStorage`, not
// `localStorage`: closing the tab should close the door. It is not a
// credential — it identifies nobody and the server refuses it as one — so the
// only thing losing it costs is another trip through the numpad.
const UNLOCK_STORAGE_KEY = 'brainlessmusic.unlockTicket';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  // A media token outlives the session token that minted it, so drop it here
  // too — otherwise a logged-out tab could still stream.
  cachedMediaToken = null;
}

export function getUnlockTicket(): string | null {
  try {
    return sessionStorage.getItem(UNLOCK_STORAGE_KEY);
  } catch {
    // Private modes and blocked site data throw on access rather than
    // returning null. Losing the ticket only means answering the numpad again.
    return null;
  }
}

export function setUnlockTicket(ticket: string | null): void {
  try {
    if (ticket) sessionStorage.setItem(UNLOCK_STORAGE_KEY, ticket);
    else sessionStorage.removeItem(UNLOCK_STORAGE_KEY);
  } catch {
    /* see getUnlockTicket */
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isMultipart?: boolean;
  /** Attach the stored unlock ticket. Only `/auth/login` needs it. */
  withUnlockTicket?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  if (options.withUnlockTicket) {
    const ticket = getUnlockTicket();
    if (ticket) headers['x-unlock-ticket'] = ticket;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isMultipart) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  if (res.status === 401) {
    setToken(null);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, payload.error ?? `Request failed with status ${res.status}`);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  /** `POST` carrying the unlock ticket — the admin sign-in, and nothing else. */
  postUnlocked: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body, withUnlockTicket: true }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData, isMultipart: true }),
};

// A plain `<audio src>` can't send an Authorization header, so the backend
// mints a short-lived, media-scoped token that may travel in the URL instead.
// It is not the session token: the server refuses a media token as a bearer
// credential, so a stream URL in browser history or an access log can't be
// replayed against the rest of the API, and it expires within hours anyway.
interface MediaTokenResponse {
  token: string;
  expiresAt: string;
}

let cachedMediaToken: { token: string; expiresAt: number } | null = null;
let inFlightMediaToken: Promise<string> | null = null;

// Renew a little early so a token can't lapse between building a URL and the
// browser actually requesting it.
const MEDIA_TOKEN_RENEW_MARGIN_MS = 60_000;

async function getMediaToken(): Promise<string> {
  if (cachedMediaToken && cachedMediaToken.expiresAt - MEDIA_TOKEN_RENEW_MARGIN_MS > Date.now()) {
    return cachedMediaToken.token;
  }

  // Collapse concurrent callers (a track list rendering many covers, later)
  // onto one mint request.
  inFlightMediaToken ??= request<MediaTokenResponse>('/auth/media-token', { method: 'POST' })
    .then((res) => {
      cachedMediaToken = { token: res.token, expiresAt: Date.parse(res.expiresAt) };
      return res.token;
    })
    .finally(() => {
      inFlightMediaToken = null;
    });

  return inFlightMediaToken;
}

/**
 * URL for `<audio src>` — supports native byte-range seeking, unlike the blob
 * download this replaced.
 */
export async function buildStreamUrl(trackId: number, quality?: 'low'): Promise<string> {
  const params = new URLSearchParams({ token: await getMediaToken() });
  if (quality) params.set('quality', quality);
  return `${API_BASE_URL}/tracks/${trackId}/stream?${params.toString()}`;
}

/**
 * URL for `<img src>`, on the same media-token scheme as streaming. `thumb`
 * is a ~256px copy — right for list rows; `full` keeps the original, for the
 * player bar and detail drawer.
 */
export async function buildCoverUrl(
  kind: 'tracks' | 'albums',
  id: number,
  size: 'thumb' | 'full' = 'thumb',
): Promise<string> {
  const params = new URLSearchParams({ token: await getMediaToken() });
  if (size === 'thumb') params.set('size', 'thumb');
  return `${API_BASE_URL}/${kind}/${id}/cover?${params.toString()}`;
}

export { API_BASE_URL };
