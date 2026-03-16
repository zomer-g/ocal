import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFilterStore, initialState, type ExtraCondition } from '@/stores/filterStore';

const PARAM_MAP = {
  q: 'q',
  from_date: 'from',
  to_date: 'to',
  source_ids: 'sources',
  entity_names: 'entities',
  location: 'loc',
  participants: 'part',
  cross_ref_status: 'xref',
  sort: 'sort',
  page: 'page',
  advancedMode: 'adv',
} as const;

type FilterKeys = keyof typeof PARAM_MAP;

function parseUrlToState(search: string) {
  const params = new URLSearchParams(search);
  const state: Record<string, unknown> = {};

  const q = params.get(PARAM_MAP.q);
  if (q != null) state.q = q;

  const from = params.get(PARAM_MAP.from_date);
  if (from) state.from_date = from;

  const to = params.get(PARAM_MAP.to_date);
  if (to) state.to_date = to;

  const sources = params.get(PARAM_MAP.source_ids);
  if (sources) state.source_ids = sources.split(',').filter(Boolean);

  const entities = params.get(PARAM_MAP.entity_names);
  if (entities) state.entity_names = entities.split('|').filter(Boolean);

  const loc = params.get(PARAM_MAP.location);
  if (loc) state.location = loc;

  const part = params.get(PARAM_MAP.participants);
  if (part) state.participants = part;

  const xref = params.get(PARAM_MAP.cross_ref_status);
  if (xref === 'confirmed' || xref === 'unconfirmed') state.cross_ref_status = xref;

  const sort = params.get(PARAM_MAP.sort);
  if (sort === 'date_asc' || sort === 'date_desc' || sort === 'relevance') state.sort = sort;

  const page = params.get(PARAM_MAP.page);
  if (page) {
    const n = parseInt(page, 10);
    if (n > 0) state.page = n;
  }

  const adv = params.get(PARAM_MAP.advancedMode);
  if (adv === '1') state.advancedMode = true;

  const conds = params.getAll('cond');
  if (conds.length > 0) {
    const extraConditions: ExtraCondition[] = conds
      .map((c) => {
        const colonIdx = c.indexOf(':');
        if (colonIdx === -1) return null;
        const op = c.slice(0, colonIdx).toUpperCase();
        const term = c.slice(colonIdx + 1);
        if ((op !== 'AND' && op !== 'OR') || !term) return null;
        return { id: crypto.randomUUID(), operator: op as 'AND' | 'OR', term };
      })
      .filter((c): c is ExtraCondition => c !== null);
    if (extraConditions.length > 0) {
      state.extraConditions = extraConditions;
      state.advancedMode = true;
    }
  }

  return state;
}

function stateToUrl(store: ReturnType<typeof useFilterStore.getState>): string {
  const params = new URLSearchParams();

  if (store.q) params.set(PARAM_MAP.q, store.q);
  if (store.from_date) params.set(PARAM_MAP.from_date, store.from_date);
  if (store.to_date) params.set(PARAM_MAP.to_date, store.to_date);
  if (store.source_ids.length) params.set(PARAM_MAP.source_ids, store.source_ids.join(','));
  if (store.entity_names.length) params.set(PARAM_MAP.entity_names, store.entity_names.join('|'));
  if (store.location) params.set(PARAM_MAP.location, store.location);
  if (store.participants) params.set(PARAM_MAP.participants, store.participants);
  if (store.cross_ref_status) params.set(PARAM_MAP.cross_ref_status, store.cross_ref_status);
  if (store.sort !== initialState.sort) params.set(PARAM_MAP.sort, store.sort);
  if (store.page > 1) params.set(PARAM_MAP.page, String(store.page));
  if (store.advancedMode) params.set(PARAM_MAP.advancedMode, '1');

  for (const cond of store.extraConditions) {
    if (cond.term.trim()) {
      params.append('cond', `${cond.operator}:${cond.term.trim()}`);
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : window.location.pathname;
}

export function useUrlSync() {
  const isSyncingFromUrl = useRef(false);
  const isInitialized = useRef(false);

  // Hydrate store from URL on first render (synchronous to avoid flicker)
  useLayoutEffect(() => {
    const search = window.location.search;
    if (!search) {
      isInitialized.current = true;
      return;
    }

    const parsed = parseUrlToState(search);
    if (Object.keys(parsed).length > 0) {
      isSyncingFromUrl.current = true;
      useFilterStore.setState({ ...initialState, ...parsed });
      isSyncingFromUrl.current = false;
    }
    isInitialized.current = true;
  }, []);

  // Sync store changes → URL
  useEffect(() => {
    const unsub = useFilterStore.subscribe((state) => {
      if (isSyncingFromUrl.current || !isInitialized.current) return;

      const url = stateToUrl(state);
      const currentUrl = window.location.pathname + window.location.search;

      if (url !== currentUrl) {
        window.history.replaceState(null, '', url);
      }
    });

    return unsub;
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      isSyncingFromUrl.current = true;
      const parsed = parseUrlToState(window.location.search);
      useFilterStore.setState({ ...initialState, ...parsed });
      isSyncingFromUrl.current = false;
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
