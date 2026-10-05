// Simple response cache keyed by URL, with in-flight request de-duplication.
// Entries live in memory and sessionStorage (so a reload doesn't refetch).

const memory = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function readSession(key: string): { at: number; data: unknown } | null {
  try {
    const raw = sessionStorage.getItem('wx:' + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, entry: { at: number; data: unknown }) {
  try {
    sessionStorage.setItem('wx:' + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage blocked: memory cache is enough.
  }
}

export async function cachedJson<T>(url: string, ttlMs: number, init?: RequestInit): Promise<T> {
  const now = Date.now();
  const hit = memory.get(url) ?? readSession(url);
  if (hit && now - hit.at < ttlMs) {
    memory.set(url, hit);
    return hit.data as T;
  }
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    const res = await fetch(url, init);
    if (!res.ok) {
      let reason = `${res.status}`;
      try {
        const body = await res.json();
        if (body?.reason) reason += ` ${body.reason}`;
      } catch {
        /* ignore */
      }
      throw new Error(`요청 실패 (${reason})`);
    }
    const data = (await res.json()) as T;
    const entry = { at: Date.now(), data };
    memory.set(url, entry);
    writeSession(url, entry);
    return data;
  })();
  inflight.set(url, p);
  try {
    return await p;
  } finally {
    inflight.delete(url);
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
