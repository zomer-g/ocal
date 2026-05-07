import type { EventRow } from './types.js';
import tooltipCss from './tooltip.css';

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let card: HTMLDivElement | null = null;

// Stable structure refs — innerHTML is only set once, then we update children.
let nameEl: HTMLDivElement | null = null;
let subEl: HTMLDivElement | null = null;
let searchInput: HTMLInputElement | null = null;
let bodyEl: HTMLDivElement | null = null;
let footerEl: HTMLDivElement | null = null;

let activeNameLower: string | null = null;          // canonical (lowercased) name currently shown
let activeSearchToken = 0;                          // monotonic counter to discard stale search responses

export interface TooltipCallbacks {
  /** Called (debounced) when the user types a non-empty search query in the input. */
  onSearch: (nameLower: string, query: string) => void;
  /** Called when the user clears the search input (returns to default 5). */
  onClearSearch: (nameLower: string) => void;
}

let callbacks: TooltipCallbacks | null = null;

export function setCallbacks(cb: TooltipCallbacks): void {
  callbacks = cb;
}

function ensureHost(): { card: HTMLDivElement; shadow: ShadowRoot } {
  if (host && shadow && card) return { card, shadow };

  // If a previous injection left a host on the page, remove it cleanly.
  const existing = document.getElementById('ocal-tooltip-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'ocal-tooltip-host';
  host.style.all = 'initial';
  host.style.position = 'static';
  document.documentElement.appendChild(host);

  shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = tooltipCss as unknown as string;
  shadow.appendChild(style);

  card = document.createElement('div');
  card.className = 'ocal-card hidden';
  card.setAttribute('role', 'tooltip');
  card.setAttribute('dir', 'rtl');
  shadow.appendChild(card);

  card.innerHTML = `
    <div class="ocal-name"></div>
    <div class="ocal-search">
      <input type="search" class="ocal-search-input" placeholder="חיפוש בתוך הפגישות…" autocomplete="off" spellcheck="false" />
    </div>
    <div class="ocal-sub"></div>
    <div class="ocal-body"></div>
    <div class="ocal-footer">מקור: <a href="https://ocal.org.il" target="_blank" rel="noopener noreferrer">ocal.org.il</a></div>
  `;

  nameEl = card.querySelector('.ocal-name');
  subEl = card.querySelector('.ocal-sub');
  searchInput = card.querySelector('.ocal-search-input');
  bodyEl = card.querySelector('.ocal-body');
  footerEl = card.querySelector('.ocal-footer');

  let searchDebounce: number | undefined;
  searchInput?.addEventListener('input', () => {
    if (!callbacks || !activeNameLower) return;
    const q = (searchInput?.value ?? '').trim();
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      if (!activeNameLower) return;
      if (q === '') callbacks!.onClearSearch(activeNameLower);
      else callbacks!.onSearch(activeNameLower, q);
    }, 300);
  });

  return { card, shadow };
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRows(events: EventRow[]): string {
  return events
    .map((ev) => {
      const date = formatDate(ev.start_time);
      const source = ev.source_name ?? '';
      const loc = ev.location ? ` · ${escapeText(ev.location)}` : '';
      return `
        <li class="ocal-row">
          <div class="ocal-row-date">${escapeText(date)}</div>
          <div class="ocal-row-title">${escapeText(ev.title || '(ללא כותרת)')}</div>
          <div class="ocal-row-source">${escapeText(source)}${loc}</div>
        </li>
      `;
    })
    .join('');
}

function showCard(target: HTMLElement): void {
  if (!card) return;
  card.classList.remove('hidden');
  position(card, target);
}

function setHeader(rawName: string, subText: string): void {
  if (nameEl) nameEl.textContent = rawName;
  if (subEl) subEl.textContent = subText;
}

/**
 * Open / refresh the tooltip for a given mark target. Resets the search input
 * and shows a skeleton state until events arrive.
 */
export function showSkeleton(target: HTMLElement, rawName: string, nameLower: string): void {
  ensureHost();
  if (activeNameLower !== nameLower) {
    activeNameLower = nameLower;
    if (searchInput) searchInput.value = '';
    activeSearchToken++;
  }
  setHeader(rawName, 'טוען פגישות אחרונות מ-Ocal…');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="ocal-skeleton" style="width:90%"></div>
      <div class="ocal-skeleton" style="width:70%"></div>
      <div class="ocal-skeleton" style="width:80%"></div>
    `;
  }
  showCard(target);
}

/** Show the default (last-N, no search) state. */
export function showEvents(target: HTMLElement, rawName: string, nameLower: string, events: EventRow[]): void {
  ensureHost();
  activeNameLower = nameLower;
  setHeader(rawName, `${events.length} פגישות אחרונות`);
  if (bodyEl) {
    bodyEl.innerHTML = events.length
      ? `<ul class="ocal-list">${renderRows(events)}</ul>`
      : `<div class="ocal-empty">לא נמצאו פגישות.</div>`;
  }
  showCard(target);
}

/** Show search results. Replaces only the body — header and search input stay. */
export function showSearchResults(rawName: string, nameLower: string, query: string, events: EventRow[]): void {
  if (activeNameLower !== nameLower) return; // user moved on
  setHeader(rawName, events.length === 0
    ? `אין תוצאות עבור "${query}"`
    : `${events.length} תוצאות עבור "${query}"`);
  if (bodyEl) {
    bodyEl.innerHTML = events.length
      ? `<ul class="ocal-list">${renderRows(events)}</ul>`
      : `<div class="ocal-empty">לא נמצאו פגישות התואמות לחיפוש.</div>`;
  }
}

export function showSearchSkeleton(rawName: string, nameLower: string, query: string): void {
  if (activeNameLower !== nameLower) return;
  setHeader(rawName, `מחפש "${query}"…`);
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="ocal-skeleton" style="width:90%"></div>
      <div class="ocal-skeleton" style="width:70%"></div>
    `;
  }
}

export function showError(target: HTMLElement, rawName: string, nameLower: string, message: string): void {
  ensureHost();
  activeNameLower = nameLower;
  setHeader(rawName, '');
  if (bodyEl) {
    bodyEl.innerHTML = `<div class="ocal-error">לא הצלחנו לטעון פגישות: ${escapeText(message)}</div>`;
  }
  showCard(target);
}

export function hide(): void {
  if (card) card.classList.add('hidden');
  activeNameLower = null;
}

export function getCardElement(): HTMLDivElement | null {
  return card;
}

export function getActiveNameLower(): string | null {
  return activeNameLower;
}

export function newSearchToken(): number {
  return ++activeSearchToken;
}

export function isCurrentSearchToken(token: number): boolean {
  return token === activeSearchToken;
}

function position(card: HTMLDivElement, target: HTMLElement): void {
  card.style.visibility = 'hidden';
  card.classList.remove('hidden');

  const rect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  let top = rect.bottom + margin;
  if (top + cardRect.height > vh - 8) {
    top = rect.top - cardRect.height - margin;
  }
  if (top < 8) top = 8;

  let left = rect.left + rect.width / 2 - cardRect.width / 2;
  if (left + cardRect.width > vw - 8) left = vw - cardRect.width - 8;
  if (left < 8) left = 8;

  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
  card.style.visibility = '';
}
