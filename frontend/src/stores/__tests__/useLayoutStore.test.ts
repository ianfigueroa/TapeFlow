import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LayoutItem } from 'react-grid-layout';
import type { Layouts } from '../../types/layout';
import type { PanelId } from '../../types/layout';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Import store after localStorage mock is set up
import { useLayoutStore, STORAGE_KEY, DEFAULT_LAYOUTS, BUILT_IN_PRESETS } from '../useLayoutStore';

describe('useLayoutStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useLayoutStore.setState({
      layoutVersion: 1,
      currentLayouts: { ...DEFAULT_LAYOUTS },
      activePresetId: 'default',
      presets: [...BUILT_IN_PRESETS],
      isLocked: false,
      hiddenPanels: [],
    });

    // Clear localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default layout', () => {
      const state = useLayoutStore.getState();

      expect(state.layoutVersion).toBe(1);
      expect(state.currentLayouts).toBeDefined();
      expect(state.currentLayouts.lg).toBeDefined();
      expect(state.activePresetId).toBe('default');
      expect(state.isLocked).toBe(false);
      expect(state.hiddenPanels).toEqual([]);
    });

    it('should have built-in presets on initialization', () => {
      const state = useLayoutStore.getState();

      expect(state.presets.length).toBeGreaterThanOrEqual(4);
      expect(state.presets.some((p) => p.id === 'default')).toBe(true);
      expect(state.presets.some((p) => p.id === 'wide-chart')).toBe(true);
      expect(state.presets.some((p) => p.id === 'order-flow-focus')).toBe(true);
      expect(state.presets.some((p) => p.id === 'compact')).toBe(true);
    });

    it('should mark built-in presets as isBuiltIn: true', () => {
      const state = useLayoutStore.getState();
      const builtInPresets = state.presets.filter((p) => p.isBuiltIn);

      expect(builtInPresets.length).toBeGreaterThanOrEqual(4);
      builtInPresets.forEach((preset) => {
        expect(preset.isBuiltIn).toBe(true);
      });
    });

    it('should have all 5 panels in default layout', () => {
      const state = useLayoutStore.getState();
      const lgLayout = state.currentLayouts.lg;

      const panelIds: PanelId[] = [
        'tape-table',
        'algo-signals',
        'tabbed-chart',
        'order-book',
        'analysis-dashboard',
      ];

      panelIds.forEach((panelId) => {
        const panel = lgLayout?.find((item: LayoutItem) => item.i === panelId);
        expect(panel).toBeDefined();
        expect(panel?.x).toBeGreaterThanOrEqual(0);
        expect(panel?.y).toBeGreaterThanOrEqual(0);
        expect(panel?.w).toBeGreaterThan(0);
        expect(panel?.h).toBeGreaterThan(0);
      });
    });
  });

  describe('updateLayouts', () => {
    it('should update currentLayouts', () => {
      const store = useLayoutStore.getState();
      const newLayouts: Layouts = {
        lg: [
          { i: 'tape-table', x: 0, y: 0, w: 6, h: 12 },
          { i: 'algo-signals', x: 0, y: 12, w: 6, h: 4 },
          { i: 'tabbed-chart', x: 6, y: 0, w: 12, h: 16 },
          { i: 'order-book', x: 18, y: 0, w: 6, h: 10 },
          { i: 'analysis-dashboard', x: 18, y: 10, w: 6, h: 6 },
        ],
      };

      store.updateLayouts(newLayouts);

      const updatedState = useLayoutStore.getState();
      expect(updatedState.currentLayouts.lg).toEqual(newLayouts.lg);
    });

    it('should preserve other breakpoints when updating one', () => {
      const store = useLayoutStore.getState();
      const initialMd = store.currentLayouts.md;

      store.updateLayouts({
        lg: [{ i: 'tape-table', x: 0, y: 0, w: 8, h: 10 }],
      });

      const updatedState = useLayoutStore.getState();
      expect(updatedState.currentLayouts.md).toEqual(initialMd);
    });
  });

  describe('loadPreset', () => {
    it('should switch active preset and update currentLayouts', () => {
      const store = useLayoutStore.getState();

      store.loadPreset('wide-chart');

      const updatedState = useLayoutStore.getState();
      expect(updatedState.activePresetId).toBe('wide-chart');

      // Verify the layout changed
      const wideChartPreset = updatedState.presets.find((p) => p.id === 'wide-chart');
      expect(updatedState.currentLayouts).toEqual(wideChartPreset?.layouts);
    });

    it('should not change state if preset does not exist', () => {
      const store = useLayoutStore.getState();
      const originalPresetId = store.activePresetId;
      const originalLayouts = { ...store.currentLayouts };

      store.loadPreset('non-existent-preset');

      const updatedState = useLayoutStore.getState();
      expect(updatedState.activePresetId).toBe(originalPresetId);
      expect(updatedState.currentLayouts.lg).toEqual(originalLayouts.lg);
    });
  });

  describe('savePreset', () => {
    it('should create new preset with current layouts', () => {
      const store = useLayoutStore.getState();
      const initialPresetCount = store.presets.length;

      // Modify layout first
      store.updateLayouts({
        lg: [{ i: 'tape-table', x: 2, y: 2, w: 8, h: 12 }],
      });

      store.savePreset('My Custom Layout');

      const updatedState = useLayoutStore.getState();
      expect(updatedState.presets.length).toBe(initialPresetCount + 1);

      const newPreset = updatedState.presets.find((p) => p.name === 'My Custom Layout');
      expect(newPreset).toBeDefined();
      expect(newPreset?.isBuiltIn).toBe(false);
      expect(newPreset?.layouts.lg).toContainEqual({ i: 'tape-table', x: 2, y: 2, w: 8, h: 12 });
    });

    it('should set activePresetId to the new preset', () => {
      const store = useLayoutStore.getState();

      store.savePreset('New Preset');

      const updatedState = useLayoutStore.getState();
      const newPreset = updatedState.presets.find((p) => p.name === 'New Preset');
      expect(updatedState.activePresetId).toBe(newPreset?.id);
    });

    it('should generate unique id for new preset', () => {
      const store = useLayoutStore.getState();

      store.savePreset('Preset A');
      store.savePreset('Preset B');

      const updatedState = useLayoutStore.getState();
      const presetA = updatedState.presets.find((p) => p.name === 'Preset A');
      const presetB = updatedState.presets.find((p) => p.name === 'Preset B');

      expect(presetA?.id).not.toBe(presetB?.id);
    });

    it('should update existing custom preset if name matches', () => {
      const store = useLayoutStore.getState();

      store.savePreset('My Layout');
      const firstSaveState = useLayoutStore.getState();
      const presetCount = firstSaveState.presets.length;

      // Modify layout
      store.updateLayouts({
        lg: [{ i: 'tape-table', x: 5, y: 5, w: 10, h: 10 }],
      });

      store.savePreset('My Layout');

      const finalState = useLayoutStore.getState();
      expect(finalState.presets.length).toBe(presetCount); // No new preset added

      const updatedPreset = finalState.presets.find((p) => p.name === 'My Layout');
      expect(updatedPreset?.layouts.lg).toContainEqual({ i: 'tape-table', x: 5, y: 5, w: 10, h: 10 });
    });
  });

  describe('deletePreset', () => {
    it('should remove custom preset', () => {
      const store = useLayoutStore.getState();

      store.savePreset('To Be Deleted');
      const stateAfterSave = useLayoutStore.getState();
      const customPreset = stateAfterSave.presets.find((p) => p.name === 'To Be Deleted');
      expect(customPreset).toBeDefined();

      store.deletePreset(customPreset!.id);

      const finalState = useLayoutStore.getState();
      expect(finalState.presets.find((p) => p.id === customPreset!.id)).toBeUndefined();
    });

    it('should NOT delete built-in preset', () => {
      const store = useLayoutStore.getState();
      const initialPresetCount = store.presets.length;

      store.deletePreset('default');

      const updatedState = useLayoutStore.getState();
      expect(updatedState.presets.length).toBe(initialPresetCount);
      expect(updatedState.presets.find((p) => p.id === 'default')).toBeDefined();
    });

    it('should switch to default preset if deleted preset was active', () => {
      const store = useLayoutStore.getState();

      store.savePreset('Active Custom');
      const stateAfterSave = useLayoutStore.getState();
      const customPreset = stateAfterSave.presets.find((p) => p.name === 'Active Custom');
      expect(stateAfterSave.activePresetId).toBe(customPreset!.id);

      store.deletePreset(customPreset!.id);

      const finalState = useLayoutStore.getState();
      expect(finalState.activePresetId).toBe('default');
    });
  });

  describe('setLocked', () => {
    it('should toggle lock state to true', () => {
      const store = useLayoutStore.getState();
      expect(store.isLocked).toBe(false);

      store.setLocked(true);

      expect(useLayoutStore.getState().isLocked).toBe(true);
    });

    it('should toggle lock state to false', () => {
      const store = useLayoutStore.getState();
      store.setLocked(true);

      store.setLocked(false);

      expect(useLayoutStore.getState().isLocked).toBe(false);
    });
  });

  describe('resetToDefault', () => {
    it('should restore default layout', () => {
      const store = useLayoutStore.getState();

      // Make modifications
      store.updateLayouts({
        lg: [{ i: 'tape-table', x: 10, y: 10, w: 4, h: 4 }],
      });
      store.loadPreset('wide-chart');
      store.setLocked(true);
      store.hidePanel('algo-signals');

      store.resetToDefault();

      const resetState = useLayoutStore.getState();
      expect(resetState.activePresetId).toBe('default');
      expect(resetState.isLocked).toBe(false);
      expect(resetState.hiddenPanels).toEqual([]);
      expect(resetState.currentLayouts).toEqual(DEFAULT_LAYOUTS);
    });

    it('should preserve custom presets after reset', () => {
      const store = useLayoutStore.getState();

      store.savePreset('My Custom');
      store.resetToDefault();

      const resetState = useLayoutStore.getState();
      expect(resetState.presets.find((p) => p.name === 'My Custom')).toBeDefined();
    });
  });

  describe('panel visibility', () => {
    it('hidePanel should add panel to hiddenPanels', () => {
      const store = useLayoutStore.getState();
      expect(store.hiddenPanels).toEqual([]);

      store.hidePanel('algo-signals');

      expect(useLayoutStore.getState().hiddenPanels).toContain('algo-signals');
    });

    it('showPanel should remove panel from hiddenPanels', () => {
      const store = useLayoutStore.getState();
      store.hidePanel('algo-signals');
      store.hidePanel('order-book');

      store.showPanel('algo-signals');

      const state = useLayoutStore.getState();
      expect(state.hiddenPanels).not.toContain('algo-signals');
      expect(state.hiddenPanels).toContain('order-book');
    });

    it('togglePanel should add panel if not hidden', () => {
      const store = useLayoutStore.getState();

      store.togglePanel('tape-table');

      expect(useLayoutStore.getState().hiddenPanels).toContain('tape-table');
    });

    it('togglePanel should remove panel if hidden', () => {
      const store = useLayoutStore.getState();
      store.hidePanel('tape-table');

      store.togglePanel('tape-table');

      expect(useLayoutStore.getState().hiddenPanels).not.toContain('tape-table');
    });

    it('should not duplicate panel in hiddenPanels', () => {
      const store = useLayoutStore.getState();

      store.hidePanel('algo-signals');
      store.hidePanel('algo-signals');

      const state = useLayoutStore.getState();
      const count = state.hiddenPanels.filter((p) => p === 'algo-signals').length;
      expect(count).toBe(1);
    });
  });

  describe('localStorage persistence', () => {
    it('should use correct storage key', () => {
      expect(STORAGE_KEY).toBe('tapeflow-layout');
    });

    it('should have persist middleware configured', () => {
      // Verify the store has persist functionality
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeApi = useLayoutStore as any;

      // Zustand persist adds these methods
      expect(typeof storeApi.persist).toBe('object');
      expect(typeof storeApi.persist.getOptions).toBe('function');

      // Check the persist options include our storage key
      const options = storeApi.persist.getOptions();
      expect(options.name).toBe(STORAGE_KEY);
    });

    it('should include all state keys in persisted data', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeApi = useLayoutStore as any;
      const options = storeApi.persist.getOptions();

      // Get current state
      const state = useLayoutStore.getState();

      // The partialize function should return the correct keys
      const partializedState = options.partialize(state);

      expect(partializedState).toHaveProperty('layoutVersion');
      expect(partializedState).toHaveProperty('currentLayouts');
      expect(partializedState).toHaveProperty('activePresetId');
      expect(partializedState).toHaveProperty('presets');
      expect(partializedState).toHaveProperty('isLocked');
      expect(partializedState).toHaveProperty('hiddenPanels');

      // Actions should NOT be persisted
      expect(partializedState).not.toHaveProperty('updateLayouts');
      expect(partializedState).not.toHaveProperty('loadPreset');
    });
  });
});
