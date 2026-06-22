import { PUBLIC_API_URL } from '$env/static/public';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${PUBLIC_API_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });
    throw new ApiError(res.status, body.error || 'Request failed', body.details, headers);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
