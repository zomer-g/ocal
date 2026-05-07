import type { EventRow, Message, PersonEntity, Response } from './types.js';

const API_BASE = 'https://ocal.org.il/api/public';
const PEOPLE_KEY = 'ocal:people:v1';
const PEOPLE_TTL_MS = 60 * 60 * 1000;
const EVENTS_TTL_MS = 10 * 60 * 1000;
// 30s timeout — events endpoint can be slow on cold start (Render container
// wake-up + heavy JSON aggregation on event_entities). No retry: a retry would
// just double the wait when the server is genuinely slow.
const FETCH_TIMEOUT_MS = 30_000;

interface PeopleCache {
  fetchedAt: number;
  names: string[];
}

interface EventsCache {
  fetchedAt: number;
  events: EventRow[];
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getPeopleCached(): Promise<string[]> {
  const stored = (await chrome.storage.local.get(PEOPLE_KEY))[PEOPLE_KEY] as PeopleCache | undefined;
  const fresh = stored && Date.now() - stored.fetchedAt < PEOPLE_TTL_MS;
  if (fresh) return stored.names;

  try {
    const json = (await fetchJson(`${API_BASE}/entities?type=person`)) as { data: PersonEntity[] };
    const names = (json.data ?? [])
      .map((e) => e.entity_name?.trim())
      .filter((n): n is string => !!n && n.length >= 2);
    const cache: PeopleCache = { fetchedAt: Date.now(), names };
    await chrome.storage.local.set({ [PEOPLE_KEY]: cache });
    return names;
  } catch (err) {
    if (stored) return stored.names;
    throw err;
  }
}

async function getEventsCached(name: string): Promise<EventRow[]> {
  const key = `ocal:events:${name.trim().toLowerCase()}`;
  const stored = (await chrome.storage.local.get(key))[key] as EventsCache | undefined;
  if (stored && Date.now() - stored.fetchedAt < EVENTS_TTL_MS) return stored.events;

  const url = `${API_BASE}/events?entity_names=${encodeURIComponent(name)}&sort=date_desc&per_page=5`;
  const json = (await fetchJson(url)) as { data: EventRow[] };
  const events = json.data ?? [];
  const cache: EventsCache = { fetchedAt: Date.now(), events };
  await chrome.storage.local.set({ [key]: cache });
  return events;
}

async function searchEvents(name: string, query: string): Promise<EventRow[]> {
  // Search results are NOT cached — a stale search would mislead.
  const params = new URLSearchParams({
    entity_names: name,
    q: query,
    sort: 'date_desc',
    per_page: '20',
  });
  const json = (await fetchJson(`${API_BASE}/events?${params}`)) as { data: EventRow[] };
  return json.data ?? [];
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (err) {
    console.warn('[ocal] could not inject content script:', err);
  }
});

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse: (r: Response<unknown>) => void) => {
  (async () => {
    try {
      if (msg.type === 'getPeople') {
        const names = await getPeopleCached();
        sendResponse({ ok: true, data: names });
      } else if (msg.type === 'getEvents') {
        const events = await getEventsCached(msg.name);
        sendResponse({ ok: true, data: events });
      } else if (msg.type === 'searchEvents') {
        const events = await searchEvents(msg.name, msg.query);
        sendResponse({ ok: true, data: events });
      } else {
        sendResponse({ ok: false, error: 'unknown message type' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});
