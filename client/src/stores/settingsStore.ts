import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  hideFutureEvents: boolean;
  setHideFutureEvents: (val: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hideFutureEvents: true,
      setHideFutureEvents: (hideFutureEvents) => set({ hideFutureEvents }),
    }),
    { name: 'ocal-settings' }
  )
);
