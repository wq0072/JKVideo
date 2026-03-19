import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  coverQuality: 'hd' | 'normal';
  setCoverQuality: (q: 'hd' | 'normal') => Promise<void>;
  restore: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  coverQuality: 'hd',

  setCoverQuality: async (q) => {
    await AsyncStorage.setItem('COVER_QUALITY', q);
    set({ coverQuality: q });
  },

  restore: async () => {
    const q = await AsyncStorage.getItem('COVER_QUALITY');
    if (q === 'hd' || q === 'normal') set({ coverQuality: q });
  },
}));
