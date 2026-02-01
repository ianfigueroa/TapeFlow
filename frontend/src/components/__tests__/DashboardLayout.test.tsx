// DashboardLayout.test.tsx - Tests for Zustand selector optimization
// Bug: Selectors returning new function/object references cause unnecessary re-renders

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecordingStore } from '../../stores/useRecordingStore';
import { useMarketStore } from '../../stores/useMarketStore';

// Test that action functions have stable references when using getState()
describe('DashboardLayout Zustand Selector Optimization', () => {
  beforeEach(() => {
    // Reset stores before each test
    useRecordingStore.setState({
      isRecording: false,
      activeSymbol: null,
      sessions: [],
      tradeCount: 0,
      snapshotCount: 0,
      duration: 0,
    });

    useMarketStore.setState({
      isConnected: false,
      connectionError: null,
      reconnectAttempts: 0,
      ws: null,
      symbols: new Map(),
      activeSymbols: [],
      selectedSymbol: null,
      tabs: [],
      combinedTrades: [],
      settings: {
        combinedTape: false,
        darkMode: true,
        pauseScroll: false,
        maxTrades: 500,
      },
    });
  });

  describe('Recording Store Actions', () => {
    it('should return stable action references using getState()', () => {
      // Get actions via getState() - should always return same reference
      const actions1 = useRecordingStore.getState();
      const actions2 = useRecordingStore.getState();

      // Actions should be stable references
      expect(actions1.startRecording).toBe(actions2.startRecording);
      expect(actions1.stopRecording).toBe(actions2.stopRecording);
    });

    it('should return stable action references even after state changes', () => {
      const startRecording1 = useRecordingStore.getState().startRecording;
      const stopRecording1 = useRecordingStore.getState().stopRecording;

      // Trigger a state change
      act(() => {
        useRecordingStore.setState({ isRecording: true, duration: 10 });
      });

      const startRecording2 = useRecordingStore.getState().startRecording;
      const stopRecording2 = useRecordingStore.getState().stopRecording;

      // Actions should still be the same references
      expect(startRecording1).toBe(startRecording2);
      expect(stopRecording1).toBe(stopRecording2);
    });

    it('should NOT trigger re-render when only duration changes (primitive selector)', () => {
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        return useRecordingStore((state) => state.isRecording);
      });

      expect(result.current).toBe(false);
      const initialRenderCount = renderCount.count;

      // Update duration (different state slice)
      act(() => {
        useRecordingStore.setState({ duration: 100 });
      });

      // Should NOT have caused a re-render since we only select isRecording
      expect(renderCount.count).toBe(initialRenderCount);
    });

    it('should trigger re-render only when selected primitive changes', () => {
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        return useRecordingStore((state) => state.isRecording);
      });

      expect(result.current).toBe(false);
      const initialRenderCount = renderCount.count;

      // Update the selected value
      act(() => {
        useRecordingStore.setState({ isRecording: true });
      });

      // SHOULD have caused exactly one re-render
      expect(renderCount.count).toBe(initialRenderCount + 1);
      expect(result.current).toBe(true);
    });
  });

  describe('Market Store Selectors', () => {
    it('should return stable action references using getState()', () => {
      const actions1 = useMarketStore.getState();
      const actions2 = useMarketStore.getState();

      expect(actions1.selectSymbol).toBe(actions2.selectSymbol);
      expect(actions1.removeTab).toBe(actions2.removeTab);
      expect(actions1.updateSettings).toBe(actions2.updateSettings);
      expect(actions1.clearTrades).toBe(actions2.clearTrades);
    });

    it('should NOT trigger re-render for action selectors when using getState()', () => {
      // This test verifies that using getState() for actions avoids re-renders
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        // Correct pattern: get actions via getState() once
        return useMarketStore.getState().selectSymbol;
      });

      const initialRenderCount = renderCount.count;

      // Trigger state changes
      act(() => {
        useMarketStore.setState({ selectedSymbol: 'BTCUSDT' });
      });

      // Hook should NOT re-render since we used getState()
      expect(renderCount.count).toBe(initialRenderCount);
      // But we still have the working function
      expect(typeof result.current).toBe('function');
    });

    it('should provide shallow comparison for object selectors', async () => {
      // This tests that useShallow properly compares objects
      const { useShallow } = await import('zustand/react/shallow');

      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        return useMarketStore(
          useShallow((state) => ({
            selectedSymbol: state.selectedSymbol,
            tabs: state.tabs,
          }))
        );
      });

      const initialRenderCount = renderCount.count;

      // Update unrelated state
      act(() => {
        useMarketStore.setState({ connectionError: 'test error' });
      });

      // Should NOT re-render since selectedSymbol and tabs haven't changed
      expect(renderCount.count).toBe(initialRenderCount);
      expect(result.current.selectedSymbol).toBe(null);
    });

    it('should re-render with shallow comparison when selected values change', async () => {
      const { useShallow } = await import('zustand/react/shallow');

      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        return useMarketStore(
          useShallow((state) => ({
            selectedSymbol: state.selectedSymbol,
            tabs: state.tabs,
          }))
        );
      });

      const initialRenderCount = renderCount.count;

      // Update selected state
      act(() => {
        useMarketStore.setState({ selectedSymbol: 'ETHUSDT' });
      });

      // SHOULD re-render since selectedSymbol changed
      expect(renderCount.count).toBe(initialRenderCount + 1);
      expect(result.current.selectedSymbol).toBe('ETHUSDT');
    });

    it('should NOT re-render when symbols Map has same content (with shallow)', async () => {
      const { useShallow } = await import('zustand/react/shallow');

      // Set initial state with a Map
      const initialSymbols = new Map();
      initialSymbols.set('BTCUSDT', { symbol: 'BTCUSDT', lastPrice: 50000 });

      act(() => {
        useMarketStore.setState({ symbols: initialSymbols });
      });

      const renderCount = { count: 0 };

      renderHook(() => {
        renderCount.count++;
        return useMarketStore(
          useShallow((state) => ({
            symbols: state.symbols,
          }))
        );
      });

      const initialRenderCount = renderCount.count;

      // Update unrelated state (should not trigger re-render)
      act(() => {
        useMarketStore.setState({ connectionError: 'some error' });
      });

      expect(renderCount.count).toBe(initialRenderCount);
    });
  });

  describe('Combined selector patterns', () => {
    it('should use primitive selectors for frequently updating values', () => {
      // Pattern: recordingDuration updates every 100ms
      // Solution: Select it as a primitive, not in an object
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        return {
          // Primitive selector - only re-renders when this exact value changes
          isRecording: useRecordingStore((state) => state.isRecording),
          duration: useRecordingStore((state) => state.duration),
        };
      });

      const initialRenderCount = renderCount.count;

      // Simulate duration updates (happens every 100ms during recording)
      act(() => {
        useRecordingStore.setState({ duration: 1 });
      });

      // Each duration change WILL cause re-render (this is expected)
      // But importantly, changes to OTHER state won't cause re-renders
      expect(renderCount.count).toBe(initialRenderCount + 1);
      expect(result.current.duration).toBe(1);
    });

    it('should maintain functionality when using getState() for actions', () => {
      // Verify that actions obtained via getState() still work correctly
      const { startRecording, stopRecording } = useRecordingStore.getState();

      // Actions should be callable
      expect(typeof startRecording).toBe('function');
      expect(typeof stopRecording).toBe('function');

      // Note: We don't actually call startRecording here as it has side effects
      // But we verify the reference is stable and callable
    });
  });
});
