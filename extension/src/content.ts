import type { EventRow, Message, Response } from './types.js';
import {
  hide,
  showEvents,
  showError,
  showSkeleton,
  showSearchResults,
  showSearchSkeleton,
  getCardElement,
  getActiveNameLower,
  newSearchToken,
  isCurrentSearchToken,
  setCallbacks,
} from './tooltip.js';

interface OcalGlobals {
  __ocalInjected?: boolean;
  __ocalListenersAttached?: boolean;
  __ocalNameSpans?: Map<string, Set<HTMLSpanElement>>;
  __ocalEmptyNames?: Set<string>;
  __ocalEventsCache?: Map<string, EventRow[]>;
  __ocalRawByName?: Map<string, string>;
}

const w = window as unknown as Window & OcalGlobals;

const MARK_CLASS = 'ocal-mark';
const HOVER_DEBOUNCE_MS = 150;
const HIDE_GRACE_MS = 250;
const STYLE_ID = 'ocal-mark-style';

function ensureMarkStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${MARK_CLASS} {
      text-decoration: underline dotted #2563eb;
      text-decoration-thickness: 1.5px;
      text-underline-offset: 3px;
      cursor: help;
    }
  `;
  document.head.appendChild(style);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(names: string[]): RegExp | null {
  if (names.length === 0) return null;
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const alternation = sorted.map(escapeForRegex).join('|');
  return new RegExp(
    `(?<![\\u0590-\\u05FFA-Za-z0-9_])(${alternation})(?![\\u0590-\\u05FFA-Za-z0-9_])`,
    'g',
  );
}

const SKIP_SELECTOR = 'script,style,noscript,input,textarea,select,code,pre,[contenteditable="true"],[data-ocal-skip],.ocal-mark';

function shouldSkip(node: Node): boolean {
  let p: Node | null = node.parentNode;
  while (p && p.nodeType === Node.ELEMENT_NODE) {
    const el = p as Element;
    if (el.id === 'ocal-tooltip-host') return true;
    if (el.matches?.(SKIP_SELECTOR)) return true;
    p = p.parentNode;
  }
  return false;
}

function collectTextNodes(): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (shouldSkip(n)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    nodes.push(cur as Text);
  }
  return nodes;
}

function wrapMatchesInNode(node: Text, re: RegExp, registry: Map<string, Set<HTMLSpanElement>>): void {
  const text = node.nodeValue ?? '';
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let foundAny = false;

  while ((match = re.exec(text)) !== null) {
    foundAny = true;
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }
    const canonical = match[0].trim().toLowerCase();
    const span = document.createElement('span');
    span.className = MARK_CLASS;
    span.dataset.ocalName = canonical;
    span.dataset.ocalRaw = match[0];
    span.textContent = match[0];
    fragment.appendChild(span);

    let set = registry.get(canonical);
    if (!set) {
      set = new Set();
      registry.set(canonical, set);
    }
    set.add(span);
    if (!w.__ocalRawByName!.has(canonical)) {
      w.__ocalRawByName!.set(canonical, match[0]);
    }

    lastIndex = end;
  }

  if (!foundAny) return;
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  node.parentNode?.replaceChild(fragment, node);
}

function unwrapAllForName(name: string, registry: Map<string, Set<HTMLSpanElement>>): void {
  const set = registry.get(name);
  if (!set) return;
  for (const span of set) {
    if (!span.isConnected) continue;
    const text = document.createTextNode(span.dataset.ocalRaw ?? span.textContent ?? '');
    span.parentNode?.replaceChild(text, span);
  }
  registry.delete(name);
}

function processInChunks(nodes: Text[], re: RegExp, registry: Map<string, Set<HTMLSpanElement>>): Promise<void> {
  return new Promise((resolve) => {
    const CHUNK = 200;
    let i = 0;
    const step = () => {
      const end = Math.min(i + CHUNK, nodes.length);
      for (; i < end; i++) {
        const n = nodes[i];
        if (n.isConnected && !shouldSkip(n)) {
          wrapMatchesInNode(n, re, registry);
        }
      }
      if (i < nodes.length) {
        if (typeof (window as Window).requestIdleCallback === 'function') {
          (window as Window).requestIdleCallback(step, { timeout: 200 });
        } else {
          setTimeout(step, 0);
        }
      } else {
        resolve();
      }
    };
    step();
  });
}

function sendMessage<T>(msg: Message): Promise<Response<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: Response<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'unknown error' });
        return;
      }
      resolve(resp);
    });
  });
}

let hoverTimer: number | undefined;
let hideTimer: number | undefined;
let activeName: string | null = null;
let activeTarget: HTMLElement | null = null;
const inFlight = new Set<string>();

function onMouseOver(ev: MouseEvent): void {
  const t = ev.target as Element | null;

  // Cancel any pending hide if pointer entered the tooltip itself.
  const card = getCardElement();
  if (card && (t === card || (card.contains?.(t as Node) ?? false))) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    return;
  }

  const span = t?.closest?.(`.${MARK_CLASS}`) as HTMLSpanElement | null;
  if (!span) return;
  const name = span.dataset.ocalName;
  if (!name) return;
  if (w.__ocalEmptyNames?.has(name)) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  if (activeName === name && activeTarget === span) return;
  activeName = name;
  activeTarget = span;

  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    showFor(span, name).catch((err) => console.warn('[ocal] showFor failed', err));
  }, HOVER_DEBOUNCE_MS);
}

function onMouseOut(ev: MouseEvent): void {
  const related = ev.relatedTarget as Element | null;
  const card = getCardElement();
  if (related) {
    // Stay open if cursor moved into the tooltip or another mark.
    if (card && (related === card || card.contains(related))) return;
    if (related.closest?.(`.${MARK_CLASS}`)) return;
  }

  // Don't auto-hide while the search input is focused inside the card.
  const sr = card?.getRootNode() as ShadowRoot | undefined;
  const focused = sr?.activeElement;
  if (focused && (focused as HTMLElement).classList?.contains('ocal-search-input')) return;

  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = undefined;
  }
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    hide();
    activeName = null;
    activeTarget = null;
  }, HIDE_GRACE_MS);
}

function rawFor(nameLower: string, fallback: string): string {
  return w.__ocalRawByName!.get(nameLower) ?? fallback;
}

async function showFor(target: HTMLElement, name: string): Promise<void> {
  const cache = w.__ocalEventsCache!;
  const cached = cache.get(name);
  const raw = rawFor(name, target.dataset.ocalRaw ?? name);

  if (cached) {
    if (cached.length === 0) {
      w.__ocalEmptyNames!.add(name);
      unwrapAllForName(name, w.__ocalNameSpans!);
      hide();
      return;
    }
    showEvents(target, raw, name, cached);
    return;
  }

  showSkeleton(target, raw, name);

  // De-duplicate concurrent fetches for the same name.
  if (inFlight.has(name)) return;
  inFlight.add(name);

  try {
    const resp = await sendMessage<EventRow[]>({ type: 'getEvents', name });

    if (!resp.ok) {
      // Always cache success/failure decisions; only update UI if still active.
      if (activeName === name && activeTarget === target) {
        showError(target, raw, name, resp.error);
      }
      return;
    }

    // Always cache, regardless of whether the user is still hovering.
    cache.set(name, resp.data);

    if (resp.data.length === 0) {
      w.__ocalEmptyNames!.add(name);
      unwrapAllForName(name, w.__ocalNameSpans!);
      if (activeName === name) hide();
      return;
    }

    if (activeName === name && activeTarget === target) {
      showEvents(target, raw, name, resp.data);
    }
  } finally {
    inFlight.delete(name);
  }
}

async function handleSearch(nameLower: string, query: string): Promise<void> {
  const raw = rawFor(nameLower, nameLower);
  const token = newSearchToken();
  showSearchSkeleton(raw, nameLower, query);

  const resp = await sendMessage<EventRow[]>({ type: 'searchEvents', name: nameLower, query });
  if (!isCurrentSearchToken(token)) return;
  if (getActiveNameLower() !== nameLower) return;

  if (!resp.ok) {
    if (activeTarget) showError(activeTarget, raw, nameLower, resp.error);
    return;
  }
  showSearchResults(raw, nameLower, query, resp.data);
}

function handleClearSearch(nameLower: string): void {
  const raw = rawFor(nameLower, nameLower);
  newSearchToken(); // invalidate any in-flight search
  const cached = w.__ocalEventsCache!.get(nameLower);
  if (cached) {
    if (activeTarget) showEvents(activeTarget, raw, nameLower, cached);
  } else if (activeTarget) {
    // Fall back to skeleton + fetch.
    showSkeleton(activeTarget, raw, nameLower);
    showFor(activeTarget, nameLower).catch(() => undefined);
  }
}

function flashStatus(text: string): void {
  const id = 'ocal-status-toast';
  let el = document.getElementById(id) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      zIndex: '2147483647',
      background: 'rgba(17,24,39,0.92)',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '8px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '13px',
      direction: 'rtl',
      pointerEvents: 'none',
      transition: 'opacity 0.25s',
      opacity: '0',
    } as Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  setTimeout(() => {
    if (el) el.style.opacity = '0';
  }, 2200);
}

async function scan(): Promise<void> {
  const resp = await sendMessage<string[]>({ type: 'getPeople' });
  if (!resp.ok) {
    flashStatus(`Ocal: שגיאה בטעינת רשימת אנשים — ${resp.error}`);
    return;
  }
  const names = resp.data;
  const re = buildMatcher(names);
  if (!re) {
    flashStatus('Ocal: לא נמצאו שמות במאגר.');
    return;
  }
  const before = w.__ocalNameSpans!.size;
  const nodes = collectTextNodes();
  await processInChunks(nodes, re, w.__ocalNameSpans!);
  const after = w.__ocalNameSpans!.size;
  const newlyMarked = after - before;
  flashStatus(
    newlyMarked > 0
      ? `Ocal: סומנו ${newlyMarked} שמות חדשים בדף.`
      : 'Ocal: לא נמצאו שמות מוכרים בדף.',
  );
}

function init(): void {
  ensureMarkStyle();
  if (!w.__ocalListenersAttached) {
    document.body.addEventListener('mouseover', onMouseOver, true);
    document.body.addEventListener('mouseout', onMouseOut, true);
    w.__ocalListenersAttached = true;
  }
  setCallbacks({
    onSearch: (nameLower, query) => {
      void handleSearch(nameLower, query);
    },
    onClearSearch: (nameLower) => {
      handleClearSearch(nameLower);
    },
  });
}

if (w.__ocalInjected) {
  // Re-injection from a second toolbar click — re-bind callbacks (in case the
  // old tooltip host was removed) and rescan for any newly added DOM.
  init();
  scan().catch((err) => console.warn('[ocal] rescan failed', err));
} else {
  w.__ocalInjected = true;
  w.__ocalNameSpans = new Map();
  w.__ocalEmptyNames = new Set();
  w.__ocalEventsCache = new Map();
  w.__ocalRawByName = new Map();
  init();
  scan().catch((err) => console.warn('[ocal] initial scan failed', err));
}
