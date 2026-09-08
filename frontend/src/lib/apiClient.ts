// No .env file required for local dev — override by setting VITE_API_BASE_URL
// in a .env file at the frontend/ root if the backend isn't on localhost:3000.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const TOKEN_STORAGE_KEY = 'brainlessmusic.token';

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

export { API_BASE_URL };
