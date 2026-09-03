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

// A plain `<audio src="...">` can't send an Authorization header, and this
// backend's `authenticate` decorator only reads the header — no `?token=`
// query-param fallback (confirmed against the backend, and already noted as
// a known gap in `.docs/STATUS.md`'s manual test harness notes). So preview
// playback fetches the audio as an authenticated blob instead of pointing
// `<audio>` straight at the URL. Fine for this app's spot-check use case
// (short clips, not hours-long listening sessions) — loses native
// byte-range progressive streaming, but avoids putting a bearer token in a
// URL (browser history, access logs, screenshots).
export async function fetchStreamBlob(trackId: number, quality?: 'low'): Promise<Blob> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const qs = quality ? `?quality=${quality}` : '';
  const res = await fetch(`${API_BASE_URL}/tracks/${trackId}/stream${qs}`, { headers });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.error ?? `Stream request failed with status ${res.status}`);
  }

  return res.blob();
}

export { API_BASE_URL };
