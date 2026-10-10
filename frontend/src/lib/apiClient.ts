// Relative `/api` by default (override with VITE_API_BASE_URL): Vite proxies it in dev and the container serves it
// same-origin, so any device that reaches the page reaches the API. The prefix avoids the app's own /albums, /search.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const TOKEN_STORAGE_KEY = 'brainlessmusic.token';
const MEDIA_TOKEN_STORAGE_KEY = 'brainlessmusic.mediaToken';

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
  // A media token outlives its session token, so drop it too or a logged-out tab could still stream.
  cachedMediaToken = null;
  localStorage.removeItem(MEDIA_TOKEN_STORAGE_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isMultipart?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

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
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData, isMultipart: true }),
};

// `<audio src>` can't send headers, so the server mints a short-lived media-scoped token for the URL. It is refused
// as a bearer credential, so a leaked stream URL can't reach the rest of the API.
interface MediaTokenResponse {
  token: string;
  expiresAt: string;
}

interface StoredMediaToken {
  token: string;
  expiresAt: number;
  // The session token it was minted under. Another tab logging in as someone
  // else shares this storage, and must not stream under the old user's token.
  session: string;
}

let cachedMediaToken: StoredMediaToken | null = null;
let inFlightMediaToken: Promise<string> | null = null;

// The token is in every cover URL; keeping it across reloads keeps those URLs, and the browser cache, stable.
function loadStoredMediaToken(): StoredMediaToken | null {
  try {
    const raw = localStorage.getItem(MEDIA_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredMediaToken;
    return stored.session === getToken() ? stored : null;
  } catch {
    return null;
  }
}

// Renew a little early so a token can't lapse between building a URL and the
// browser actually requesting it.
const MEDIA_TOKEN_RENEW_MARGIN_MS = 60_000;

async function getMediaToken(): Promise<string> {
  if (cachedMediaToken?.session !== getToken()) cachedMediaToken = loadStoredMediaToken();
  if (cachedMediaToken && cachedMediaToken.expiresAt - MEDIA_TOKEN_RENEW_MARGIN_MS > Date.now()) {
    return cachedMediaToken.token;
  }

  // Collapse concurrent callers (a track list rendering many covers, later)
  // onto one mint request.
  inFlightMediaToken ??= request<MediaTokenResponse>('/auth/media-token', { method: 'POST' })
    .then((res) => {
      cachedMediaToken = { token: res.token, expiresAt: Date.parse(res.expiresAt), session: getToken() ?? '' };
      try {
        localStorage.setItem(MEDIA_TOKEN_STORAGE_KEY, JSON.stringify(cachedMediaToken));
      } catch {
        // Storage full or blocked: the in-memory copy still works for this tab.
      }
      return res.token;
    })
    .finally(() => {
      inFlightMediaToken = null;
    });

  return inFlightMediaToken;
}

/** URL for `<audio src>`, with native byte-range seeking. */
export async function buildStreamUrl(trackId: number, quality?: 'low', forceCompat?: boolean): Promise<string> {
  const params = new URLSearchParams({ token: await getMediaToken() });
  if (quality) params.set('quality', quality);
  if (forceCompat) params.set('compat', '1');
  return `${API_BASE_URL}/tracks/${trackId}/stream?${params.toString()}`;
}

/** Reports a stream that was served fine but didn't play, which the server can't see. Best effort, never a toast. */
export function reportPlaybackFailure(
  trackId: number,
  details: { mediaErrorCode?: number; detail?: string; contentType?: string },
): void {
  void apiClient.post(`/tracks/${trackId}/playback-failure`, details).catch(() => {});
}

/** Asks the server to convert a track ahead of play at the same quality. Fire-and-forget. */
export function prepareTrack(trackId: number, quality?: 'low'): void {
  const query = quality ? `?quality=${quality}` : '';
  void apiClient.post(`/tracks/${trackId}/prepare${query}`).catch(() => {});
}

/** URL for `<img src>`, via media token. `thumb` is ~256px for rows; `full` for the player and drawer. */
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
