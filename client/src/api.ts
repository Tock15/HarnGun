import type { Bill, BillHost, SplitResult } from '@harngun/shared';

export type BillView = { bill: Bill; split: SplitResult };
export interface UploadTarget { url: string; fields: Record<string, string> }
export interface Session { token: string; host: BillHost }

const SESSION_KEY = 'harngun.session';

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

let current = loadSession();

export function saveSession(session: Session | null) {
  current = session;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode: the session just lasts until the tab closes.
  }
}

/** Server error body `{ error: { code, message } }`, or a network failure (code NETWORK). */
export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) {
    super(message);
  }
}

/** Calls the API with the host's token. A 401 signs the host out so the app shows the session screen. */
export async function api<T = BillView>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(current ? { authorization: `Bearer ${current.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'No connection to the server. Check your Wi-Fi and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      saveSession(null);
      dispatchEvent(new Event('harngun:signed-out'));
    }
    throw new ApiError(json?.error?.code ?? 'INTERNAL', json?.error?.message ?? `Server error ${res.status}`, res.status);
  }
  return json as T;
}
