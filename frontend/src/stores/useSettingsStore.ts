// User preferences store - colors, visualization settings, and themes

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Color configuration for the UI
export interface ColorSettings {
  buyColor: string;
  sellColor: string;
  buyBackground: string;
  sellBackground: string;
  neutralColor: string;
  // Intensity scaling for trade size
  intensityEnabled: boolean;
  whaleThreshold: number;  // USD amount to trigger whale highlighting
  // Chart colors
  priceLineColor: string;
  volumeBarColor: string;
  vwapLineColor: string;
  deltaPositiveColor: string;
  deltaNegativeColor: string;
}

// Visualization panel toggles
export interface VisualizationSettings {
  showPriceChart: boolean;
  showVolumeChart: boolean;
  showDeltaChart: boolean;
  showVwapLine: boolean;
  chartHeight: number;  // pixels
}

// Named theme profiles
export interface ThemeProfile {
  name: string;
  colors: ColorSettings;
}

interface SettingsStore {
  // Color settings
  colors: ColorSettings;
  updateColors: (colors: Partial<ColorSettings>) => void;
  resetColors: () => void;

  // Visualization toggles
  visualization: VisualizationSettings;
  updateVisualization: (settings: Partial<VisualizationSettings>) => void;

  // Theme profiles
  profiles: ThemeProfile[];
  activeProfile: string;
  saveProfile: (name: string) => void;
  loadProfile: (name: string) => void;
  deleteProfile: (name: string) => void;
}

// Default terminal-style colors
const defaultColors: ColorSettings = {
  buyColor: '#00FF41',
  sellColor: '#FF4545',
  buyBackground: '#001100',
  sellBackground: '#110000',
  neutralColor: '#6B7280',
  intensityEnabled: true,
  whaleThreshold: 50000,
  priceLineColor: '#00FF41',
  volumeBarColor: '#3B82F6',
  vwapLineColor: '#F59E0B',
  deltaPositiveColor: '#00FF41',
  deltaNegativeColor: '#FF4545',
};

const defaultVisualization: VisualizationSettings = {
  showPriceChart: true,
  showVolumeChart: true,
  showDeltaChart: true,
  showVwapLine: true,
  chartHeight: 200,
};

// Built-in theme presets
const builtInProfiles: ThemeProfile[] = [
  {
    name: 'Terminal',
    colors: { ...defaultColors },
  },
  {
    name: 'Classic',
    colors: {
      ...defaultColors,
      buyColor: '#22C55E',
      sellColor: '#EF4444',
      buyBackground: '#052E16',
      sellBackground: '#450A0A',
    },
  },
  {
    name: 'Ocean',
    colors: {
      ...defaultColors,
      buyColor: '#06B6D4',
      sellColor: '#F97316',
      buyBackground: '#083344',
      sellBackground: '#431407',
      priceLineColor: '#06B6D4',
      deltaPositiveColor: '#06B6D4',
      deltaNegativeColor: '#F97316',
    },
  },
  {
    name: 'High Contrast',
    colors: {
      ...defaultColors,
      buyColor: '#00FF00',
      sellColor: '#FF0000',
      buyBackground: '#002200',
      sellBackground: '#220000',
    },
  },
];

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      colors: { ...defaultColors },
      visualization: { ...defaultVisualization },
      profiles: [...builtInProfiles],
      activeProfile: 'Terminal',

      updateColors: (newColors) => {
        set((state) => ({
          colors: { ...state.colors, ...newColors },
        }));
      },

      resetColors: () => {
        set({ colors: { ...defaultColors } });
      },

      updateVisualization: (settings) => {
        set((state) => ({
          visualization: { ...state.visualization, ...settings },
        }));
      },

      saveProfile: (name) => {
        const { colors, profiles } = get();
        const existingIndex = profiles.findIndex((p) => p.name === name);
        
        if (existingIndex >= 0) {
          // Update existing profile
          const newProfiles = [...profiles];
          newProfiles[existingIndex] = { name, colors: { ...colors } };
          set({ profiles: newProfiles, activeProfile: name });
        } else {
          // Create new profile
          set({
            profiles: [...profiles, { name, colors: { ...colors } }],
            activeProfile: name,
          });
        }
      },

      loadProfile: (name) => {
        const { profiles } = get();
        const profile = profiles.find((p) => p.name === name);
        if (profile) {
          set({
            colors: { ...profile.colors },
            activeProfile: name,
          });
        }
      },

      deleteProfile: (name) => {
        // Prevent deleting built-in profiles
        if (builtInProfiles.some((p) => p.name === name)) return;
        
        set((state) => ({
          profiles: state.profiles.filter((p) => p.name !== name),
          activeProfile: state.activeProfile === name ? 'Terminal' : state.activeProfile,
        }));
      },
    }),
    {
      name: 'tapeflow-settings',
    }
  )
);

// Helper functions that use the store
export function getColorSettings(): ColorSettings {
  return useSettingsStore.getState().colors;
}
