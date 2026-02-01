// Layout store for react-grid-layout persistence
// Manages panel positions, sizes, presets, and visibility

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LayoutItem } from 'react-grid-layout';
import type { PanelId, LayoutPreset, LayoutState, LayoutActions, Layouts } from '../types/layout';

export const STORAGE_KEY = 'tapeflow-layout';

// Default layout for lg breakpoint (24 columns)
// Matches current static grid: [20% | 60% | 20%] = [~5 | ~14 | ~5] cols
const DEFAULT_LG_LAYOUT: LayoutItem[] = [
  // Left column (cols 0-4)
  { i: 'tape-table', x: 0, y: 0, w: 5, h: 20, minW: 4, minH: 8 },
  { i: 'algo-signals', x: 0, y: 20, w: 5, h: 7, minW: 4, minH: 4 },
  // Center column (cols 5-18)
  { i: 'tabbed-chart', x: 5, y: 0, w: 14, h: 27, minW: 8, minH: 12 },
  // Right column (cols 19-23)
  { i: 'order-book', x: 19, y: 0, w: 5, h: 17, minW: 4, minH: 8 },
  { i: 'analysis-dashboard', x: 19, y: 17, w: 5, h: 10, minW: 4, minH: 6 },
];

// Medium breakpoint (18 columns)
const DEFAULT_MD_LAYOUT: LayoutItem[] = [
  { i: 'tape-table', x: 0, y: 0, w: 4, h: 18, minW: 3, minH: 8 },
  { i: 'algo-signals', x: 0, y: 18, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'tabbed-chart', x: 4, y: 0, w: 10, h: 24, minW: 6, minH: 12 },
  { i: 'order-book', x: 14, y: 0, w: 4, h: 14, minW: 3, minH: 8 },
  { i: 'analysis-dashboard', x: 14, y: 14, w: 4, h: 10, minW: 3, minH: 6 },
];

// Small breakpoint (12 columns) - 2-column layout
const DEFAULT_SM_LAYOUT: LayoutItem[] = [
  { i: 'tabbed-chart', x: 0, y: 0, w: 12, h: 16, minW: 6, minH: 10 },
  { i: 'tape-table', x: 0, y: 16, w: 6, h: 14, minW: 4, minH: 8 },
  { i: 'order-book', x: 6, y: 16, w: 6, h: 14, minW: 4, minH: 8 },
  { i: 'algo-signals', x: 0, y: 30, w: 6, h: 6, minW: 4, minH: 4 },
  { i: 'analysis-dashboard', x: 6, y: 30, w: 6, h: 6, minW: 4, minH: 6 },
];

// Extra small breakpoint (6 columns) - stacked layout
const DEFAULT_XS_LAYOUT: LayoutItem[] = [
  { i: 'tabbed-chart', x: 0, y: 0, w: 6, h: 12, minW: 6, minH: 10 },
  { i: 'tape-table', x: 0, y: 12, w: 6, h: 10, minW: 6, minH: 8 },
  { i: 'order-book', x: 0, y: 22, w: 6, h: 10, minW: 6, minH: 8 },
  { i: 'algo-signals', x: 0, y: 32, w: 6, h: 5, minW: 6, minH: 4 },
  { i: 'analysis-dashboard', x: 0, y: 37, w: 6, h: 6, minW: 6, minH: 6 },
];

export const DEFAULT_LAYOUTS: Layouts = {
  lg: DEFAULT_LG_LAYOUT,
  md: DEFAULT_MD_LAYOUT,
  sm: DEFAULT_SM_LAYOUT,
  xs: DEFAULT_XS_LAYOUT,
};

// Wide Chart preset - larger center, smaller sides
const WIDE_CHART_LAYOUTS: Layouts = {
  lg: [
    { i: 'tape-table', x: 0, y: 0, w: 4, h: 20, minW: 4, minH: 8 },
    { i: 'algo-signals', x: 0, y: 20, w: 4, h: 7, minW: 4, minH: 4 },
    { i: 'tabbed-chart', x: 4, y: 0, w: 16, h: 27, minW: 8, minH: 12 },
    { i: 'order-book', x: 20, y: 0, w: 4, h: 17, minW: 4, minH: 8 },
    { i: 'analysis-dashboard', x: 20, y: 17, w: 4, h: 10, minW: 4, minH: 6 },
  ],
  md: DEFAULT_MD_LAYOUT,
  sm: DEFAULT_SM_LAYOUT,
  xs: DEFAULT_XS_LAYOUT,
};

// Order Flow Focus preset - larger tape + order book
const ORDER_FLOW_LAYOUTS: Layouts = {
  lg: [
    { i: 'tape-table', x: 0, y: 0, w: 7, h: 20, minW: 4, minH: 8 },
    { i: 'algo-signals', x: 0, y: 20, w: 7, h: 7, minW: 4, minH: 4 },
    { i: 'tabbed-chart', x: 7, y: 0, w: 10, h: 27, minW: 8, minH: 12 },
    { i: 'order-book', x: 17, y: 0, w: 7, h: 17, minW: 4, minH: 8 },
    { i: 'analysis-dashboard', x: 17, y: 17, w: 7, h: 10, minW: 4, minH: 6 },
  ],
  md: DEFAULT_MD_LAYOUT,
  sm: DEFAULT_SM_LAYOUT,
  xs: DEFAULT_XS_LAYOUT,
};

// Compact preset - minimal spacing
const COMPACT_LAYOUTS: Layouts = {
  lg: [
    { i: 'tape-table', x: 0, y: 0, w: 5, h: 24, minW: 4, minH: 8 },
    { i: 'algo-signals', x: 0, y: 24, w: 5, h: 3, minW: 4, minH: 3 },
    { i: 'tabbed-chart', x: 5, y: 0, w: 14, h: 27, minW: 8, minH: 12 },
    { i: 'order-book', x: 19, y: 0, w: 5, h: 20, minW: 4, minH: 8 },
    { i: 'analysis-dashboard', x: 19, y: 20, w: 5, h: 7, minW: 4, minH: 6 },
  ],
  md: DEFAULT_MD_LAYOUT,
  sm: DEFAULT_SM_LAYOUT,
  xs: DEFAULT_XS_LAYOUT,
};

export const BUILT_IN_PRESETS: LayoutPreset[] = [
  { id: 'default', name: 'Default', layouts: DEFAULT_LAYOUTS, isBuiltIn: true },
  { id: 'wide-chart', name: 'Wide Chart', layouts: WIDE_CHART_LAYOUTS, isBuiltIn: true },
  { id: 'order-flow-focus', name: 'Order Flow Focus', layouts: ORDER_FLOW_LAYOUTS, isBuiltIn: true },
  { id: 'compact', name: 'Compact', layouts: COMPACT_LAYOUTS, isBuiltIn: true },
];

// Generate unique ID for custom presets
function generatePresetId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Deep clone layouts to prevent mutation
function cloneLayouts(layouts: Layouts): Layouts {
  return Object.fromEntries(
    Object.entries(layouts).map(([key, value]) => [
      key,
      value ? value.map((item) => ({ ...item })) : undefined,
    ])
  ) as Layouts;
}

interface LayoutStore extends LayoutState, LayoutActions {}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      // Initial state
      layoutVersion: 1,
      currentLayouts: cloneLayouts(DEFAULT_LAYOUTS),
      activePresetId: 'default',
      presets: [...BUILT_IN_PRESETS],
      isLocked: false,
      hiddenPanels: [],

      // Actions
      updateLayouts: (layouts: Layouts) => {
        set((state) => ({
          currentLayouts: {
            ...state.currentLayouts,
            ...layouts,
          },
        }));
      },

      loadPreset: (presetId: string) => {
        const { presets } = get();
        const preset = presets.find((p) => p.id === presetId);

        if (preset) {
          set({
            activePresetId: presetId,
            currentLayouts: cloneLayouts(preset.layouts),
          });
        }
      },

      savePreset: (name: string) => {
        const { presets, currentLayouts } = get();
        const existingIndex = presets.findIndex(
          (p) => p.name === name && !p.isBuiltIn
        );

        if (existingIndex >= 0) {
          // Update existing custom preset
          const updatedPresets = [...presets];
          updatedPresets[existingIndex] = {
            ...updatedPresets[existingIndex],
            layouts: cloneLayouts(currentLayouts),
          };
          set({
            presets: updatedPresets,
            activePresetId: updatedPresets[existingIndex].id,
          });
        } else {
          // Create new preset
          const newPreset: LayoutPreset = {
            id: generatePresetId(),
            name,
            layouts: cloneLayouts(currentLayouts),
            isBuiltIn: false,
          };
          set({
            presets: [...presets, newPreset],
            activePresetId: newPreset.id,
          });
        }
      },

      deletePreset: (presetId: string) => {
        const { presets, activePresetId } = get();
        const preset = presets.find((p) => p.id === presetId);

        // Don't delete built-in presets
        if (!preset || preset.isBuiltIn) {
          return;
        }

        const updatedPresets = presets.filter((p) => p.id !== presetId);
        const newActiveId = activePresetId === presetId ? 'default' : activePresetId;

        // If switching to default, also load its layouts
        if (newActiveId !== activePresetId) {
          const defaultPreset = updatedPresets.find((p) => p.id === 'default');
          set({
            presets: updatedPresets,
            activePresetId: newActiveId,
            currentLayouts: defaultPreset ? cloneLayouts(defaultPreset.layouts) : cloneLayouts(DEFAULT_LAYOUTS),
          });
        } else {
          set({ presets: updatedPresets });
        }
      },

      setLocked: (locked: boolean) => {
        set({ isLocked: locked });
      },

      resetToDefault: () => {
        set({
          currentLayouts: cloneLayouts(DEFAULT_LAYOUTS),
          activePresetId: 'default',
          isLocked: false,
          hiddenPanels: [],
        });
      },

      hidePanel: (panelId: PanelId) => {
        set((state) => {
          if (state.hiddenPanels.includes(panelId)) {
            return state; // Already hidden, no change
          }
          return {
            hiddenPanels: [...state.hiddenPanels, panelId],
          };
        });
      },

      showPanel: (panelId: PanelId) => {
        set((state) => ({
          hiddenPanels: state.hiddenPanels.filter((p) => p !== panelId),
        }));
      },

      togglePanel: (panelId: PanelId) => {
        const { hiddenPanels } = get();
        if (hiddenPanels.includes(panelId)) {
          get().showPanel(panelId);
        } else {
          get().hidePanel(panelId);
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        layoutVersion: state.layoutVersion,
        currentLayouts: state.currentLayouts,
        activePresetId: state.activePresetId,
        presets: state.presets,
        isLocked: state.isLocked,
        hiddenPanels: state.hiddenPanels,
      }),
    }
  )
);
