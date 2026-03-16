import { create } from 'zustand';

export interface ExtraCondition {
  id: string;
  term: string;
  operator: 'AND' | 'OR';
}

interface FilterState {
  q: string;
  from_date: string;
  to_date: string;
  source_ids: string[];
  entity_names: string[];
  location: string;
  participants: string;
  cross_ref_status: 'confirmed' | 'unconfirmed' | '';
  sort: 'date_asc' | 'date_desc' | 'relevance';
  page: number;

  // Advanced search builder
  advancedMode: boolean;
  extraConditions: ExtraCondition[];

  setQuery: (q: string) => void;
  setDateRange: (from: string, to: string) => void;
  setSourceIds: (ids: string[]) => void;
  setEntityNames: (names: string[]) => void;
  setLocation: (location: string) => void;
  setParticipants: (participants: string) => void;
  setCrossRefStatus: (status: 'confirmed' | 'unconfirmed' | '') => void;
  setSort: (sort: 'date_asc' | 'date_desc' | 'relevance') => void;
  setPage: (page: number) => void;
  reset: () => void;
  clearDateRange: () => void;
  clearEntities: () => void;
  clearSources: () => void;

  // Advanced search actions
  setAdvancedMode: (on: boolean) => void;
  addExtraCondition: () => void;
  updateExtraCondition: (id: string, field: 'term' | 'operator', value: string) => void;
  removeExtraCondition: (id: string) => void;
}

export const initialState = {
  q: '',
  from_date: '',
  to_date: '',
  source_ids: [] as string[],
  entity_names: [] as string[],
  location: '',
  participants: '',
  cross_ref_status: '' as '' | 'confirmed' | 'unconfirmed',
  sort: 'date_desc' as const,
  page: 1,
  advancedMode: false,
  extraConditions: [] as ExtraCondition[],
};

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,

  setQuery: (q) => set((state) => ({
    q,
    page: 1,
    // Auto-switch sort: relevance when searching, date_desc when clearing
    sort: q.trim() ? (state.sort === 'date_desc' || state.sort === 'date_asc' ? 'relevance' : state.sort) : (state.sort === 'relevance' ? 'date_desc' : state.sort),
  })),
  setDateRange: (from_date, to_date) => set({ from_date, to_date, page: 1 }),
  setSourceIds: (source_ids) => set({ source_ids, page: 1 }),
  setEntityNames: (entity_names) => set({ entity_names, page: 1 }),
  setLocation: (location) => set({ location, page: 1 }),
  setParticipants: (participants) => set({ participants, page: 1 }),
  setCrossRefStatus: (cross_ref_status) => set({ cross_ref_status, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  setPage: (page) => set({ page }),
  reset: () => set(initialState),
  clearDateRange: () => set({ from_date: '', to_date: '', page: 1 }),
  clearEntities: () => set({ entity_names: [], page: 1 }),
  clearSources: () => set({ source_ids: [], page: 1 }),

  setAdvancedMode: (on) =>
    set((state) => ({
      advancedMode: on,
      extraConditions: on ? state.extraConditions : [],
      page: 1,
    })),

  addExtraCondition: () =>
    set((state) => ({
      extraConditions: [
        ...state.extraConditions,
        { id: crypto.randomUUID(), term: '', operator: 'AND' as const },
      ],
    })),

  updateExtraCondition: (id, field, value) =>
    set((state) => ({
      extraConditions: state.extraConditions.map((c) =>
        c.id === id ? { ...c, [field]: value } : c,
      ),
      page: 1,
    })),

  removeExtraCondition: (id) =>
    set((state) => ({
      extraConditions: state.extraConditions.filter((c) => c.id !== id),
      page: 1,
    })),
}));
