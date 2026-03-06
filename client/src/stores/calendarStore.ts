import { create } from 'zustand';

export type CalendarView = 'month' | 'week' | '4day' | 'day';

interface CalendarState {
  date: string;            // YYYY-MM-DD — the anchor date
  view: CalendarView;
  enabledSourceIds: Set<string>;
  sourcesInitialized: boolean;

  setDate: (date: string) => void;
  setView: (view: CalendarView) => void;
  goToday: () => void;
  navigate: (direction: 1 | -1) => void;
  toggleSource: (id: string) => void;
  setAllSources: (ids: string[], enabled: boolean) => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  date: new Date().toISOString().split('T')[0],
  view: 'week',
  enabledSourceIds: new Set<string>(),
  sourcesInitialized: false,

  setDate: (date) => set({ date }),
  setView: (view) => set({ view }),

  goToday: () => set({ date: new Date().toISOString().split('T')[0] }),

  navigate: (direction) => {
    const { date, view } = get();
    const d = new Date(date);
    if (view === 'month') d.setMonth(d.getMonth() + direction);
    else if (view === 'week') d.setDate(d.getDate() + direction * 7);
    else if (view === '4day') d.setDate(d.getDate() + direction * 4);
    else d.setDate(d.getDate() + direction);
    set({ date: d.toISOString().split('T')[0] });
  },

  toggleSource: (id) =>
    set((state) => {
      const next = new Set(state.enabledSourceIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { enabledSourceIds: next };
    }),

  setAllSources: (ids, enabled) =>
    set({ enabledSourceIds: new Set(enabled ? ids : []), sourcesInitialized: true }),
}));
