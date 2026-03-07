import { create } from 'zustand';

interface FilterState {
  q: string;
  from_date: string;
  to_date: string;
  source_ids: string[];
  entity_names: string[];
  location: string;
  participants: string;
  sort: 'date_asc' | 'date_desc' | 'relevance';
  page: number;

  setQuery: (q: string) => void;
  setDateRange: (from: string, to: string) => void;
  setSourceIds: (ids: string[]) => void;
  setEntityNames: (names: string[]) => void;
  setLocation: (location: string) => void;
  setParticipants: (participants: string) => void;
  setSort: (sort: 'date_asc' | 'date_desc' | 'relevance') => void;
  setPage: (page: number) => void;
  reset: () => void;
}

const initialState = {
  q: '',
  from_date: '',
  to_date: '',
  source_ids: [] as string[],
  entity_names: [] as string[],
  location: '',
  participants: '',
  sort: 'date_desc' as const,
  page: 1,
};

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,

  setQuery: (q) => set({ q, page: 1 }),
  setDateRange: (from_date, to_date) => set({ from_date, to_date, page: 1 }),
  setSourceIds: (source_ids) => set({ source_ids, page: 1 }),
  setEntityNames: (entity_names) => set({ entity_names, page: 1 }),
  setLocation: (location) => set({ location, page: 1 }),
  setParticipants: (participants) => set({ participants, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  setPage: (page) => set({ page }),
  reset: () => set(initialState),
}));
