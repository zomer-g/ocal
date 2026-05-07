import type { EventRow } from './types.js';
import tooltipCss from './tooltip.css';

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let card: HTMLDivElement | null = null;

function ensureHost(): { card: HTMLDivElement; shadow: ShadowRoot } {
  if (host && shadow && card) return { card, shadow };
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
  shadow.appendChild(card);

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

export function showSkeleton(target: HTMLElement, name: string): void {
  const { card } = ensureHost();
  card.innerHTML = `
    <div class="ocal-name"></div>
    <div class="ocal-sub">טוען פגישות אחרונות מ-Ocal…</div>
    <div class="ocal-skeleton" style="width:90%"></div>
    <div class="ocal-skeleton" style="width:70%"></div>
    <div class="ocal-skeleton" style="width:80%"></div>
  `;
  const nameEl = card.querySelector('.ocal-name');
  if (nameEl) nameEl.textContent = name;
  card.classList.remove('hidden');
  position(card, target);
}

export function showEvents(target: HTMLElement, name: string, events: EventRow[]): void {
  const { card } = ensureHost();
  const rows = events
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

  card.innerHTML = `
    <div class="ocal-name"></div>
    <div class="ocal-sub">${events.length} פגישות אחרונות</div>
    <ul class="ocal-list">${rows}</ul>
    <div class="ocal-footer">מקור: <a href="https://ocal.org.il" target="_blank" rel="noopener noreferrer">ocal.org.il</a></div>
  `;
  const nameEl = card.querySelector('.ocal-name');
  if (nameEl) nameEl.textContent = name;
  card.classList.remove('hidden');
  position(card, target);
}

export function showError(target: HTMLElement, name: string, message: string): void {
  const { card } = ensureHost();
  card.innerHTML = `
    <div class="ocal-name"></div>
    <div class="ocal-error">לא הצלחנו לטעון פגישות: ${escapeText(message)}</div>
  `;
  const nameEl = card.querySelector('.ocal-name');
  if (nameEl) nameEl.textContent = name;
  card.classList.remove('hidden');
  position(card, target);
}

export function hide(): void {
  if (card) card.classList.add('hidden');
}

export function getCardElement(): HTMLDivElement | null {
  return card;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
