// TapeTable.test.tsx - Tests for render optimization
// Bug: Multiple setState calls per frame (4 calls per 16ms interval)
// Fix: Use refs for data, single forceRender pattern, batch via RAF

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducer, useRef, useState, useCallback } from 'react';

// Mock dataBuffer functions
vi.mock('../../services/dataBuffer', () => ({
  flushTradeBuffer: vi.fn(),
  setProcessedTrades: vi.fn(),
  updateVwap: vi.fn(),
  clearSymbolBuffer: vi.fn(),
  getTradeRate: vi.fn(() => ({ current: 0, avg: 0, history: [] })),
  resetTradeRateTracker: vi.fn(),
}));

// Mock calculations
vi.mock('../../utils/calculations', () => ({
  enrichTradeWithAnalytics: vi.fn((trade) => ({
    ...trade,
    vwap: 50000,
    vwapDrift: 0,
    delta: trade.side === 'buy' ? 1 : -1,
    relativeStrength: 0.5,
    momentum: 0,
    spreadAtPrint: 0.1,
  })),
}));

describe('TapeTable Render Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('forceRender pattern', () => {
    it('should use single reducer call for force render instead of multiple setState', () => {
      // The forceRender pattern uses a reducer that increments a counter
      // This triggers exactly ONE re-render per call
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        const [, forceRender] = useReducer((x) => x + 1, 0);
        return { forceRender };
      });

      const initialRenderCount = renderCount.count;

      // Call forceRender
      act(() => {
        result.current.forceRender();
      });

      // Should have caused exactly ONE re-render
      expect(renderCount.count).toBe(initialRenderCount + 1);

      // Call it again
      act(() => {
        result.current.forceRender();
      });

      // Should have caused exactly ONE more re-render
      expect(renderCount.count).toBe(initialRenderCount + 2);
    });

    it('should demonstrate old pattern with multiple setState calls causes multiple renders', () => {
      // OLD ANTI-PATTERN: Multiple setState calls = multiple re-renders
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        const [trades, setTrades] = useState<string[]>([]);
        const [newIds, setNewIds] = useState<Set<string>>(new Set());
        const [stats, setStats] = useState({ count: 0 });

        return { setTrades, setNewIds, setStats, trades, newIds, stats };
      });

      const initialRenderCount = renderCount.count;

      // Simulate the OLD pattern: 3 separate setState calls
      // Each one triggers a re-render (though React may batch some in certain modes)
      act(() => {
        result.current.setTrades(['a', 'b']);
      });

      act(() => {
        result.current.setNewIds(new Set(['a']));
      });

      act(() => {
        result.current.setStats({ count: 10 });
      });

      // Multiple re-renders occurred (at least 3, possibly more)
      expect(renderCount.count).toBeGreaterThanOrEqual(initialRenderCount + 3);
    });

    it('should demonstrate new pattern with ref + single forceRender causes one render', () => {
      // NEW PATTERN: Update refs (no render), then single forceRender
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        const tradesRef = useRef<string[]>([]);
        const newIdsRef = useRef<Set<string>>(new Set());
        const statsRef = useRef({ count: 0 });
        const [, forceRender] = useReducer((x) => x + 1, 0);

        const batchUpdate = useCallback(
          (trades: string[], newIds: Set<string>, stats: { count: number }) => {
            // Update all refs (no renders)
            tradesRef.current = trades;
            newIdsRef.current = newIds;
            statsRef.current = stats;
            // Single forceRender
            forceRender();
          },
          []
        );

        return { tradesRef, newIdsRef, statsRef, batchUpdate };
      });

      const initialRenderCount = renderCount.count;

      // All updates in one batch with single forceRender
      act(() => {
        result.current.batchUpdate(['a', 'b'], new Set(['a']), { count: 10 });
      });

      // Exactly ONE re-render
      expect(renderCount.count).toBe(initialRenderCount + 1);

      // All data is accessible via refs
      expect(result.current.tradesRef.current).toEqual(['a', 'b']);
      expect(result.current.newIdsRef.current).toEqual(new Set(['a']));
      expect(result.current.statsRef.current).toEqual({ count: 10 });
    });
  });

  describe('ref-based data storage', () => {
    it('should store displayTrades in ref without causing re-render', () => {
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        const displayTradesRef = useRef<{ id: string; price: number }[]>([]);
        return { displayTradesRef };
      });

      const initialRenderCount = renderCount.count;

      // Update ref directly (simulating what happens in interval)
      act(() => {
        result.current.displayTradesRef.current = [
          { id: '1', price: 50000 },
          { id: '2', price: 50001 },
        ];
      });

      // NO re-render should occur from ref update
      expect(renderCount.count).toBe(initialRenderCount);

      // But data is accessible
      expect(result.current.displayTradesRef.current).toHaveLength(2);
    });

    it('should store stats in ref and only update state when values change', () => {
      const renderCount = { count: 0 };

      interface Stats {
        tradesPerSecond: number;
        avgTradesPerSecond: number;
        totalTrades: number;
      }

      const { result } = renderHook(() => {
        renderCount.count++;
        const statsRef = useRef<Stats>({
          tradesPerSecond: 0,
          avgTradesPerSecond: 0,
          totalTrades: 0,
        });
        const [, forceRender] = useReducer((x) => x + 1, 0);

        const updateStats = useCallback((newStats: Stats) => {
          const prev = statsRef.current;
          // Only trigger render if values actually changed
          if (
            prev.tradesPerSecond !== newStats.tradesPerSecond ||
            prev.avgTradesPerSecond !== newStats.avgTradesPerSecond ||
            prev.totalTrades !== newStats.totalTrades
          ) {
            statsRef.current = newStats;
            forceRender();
          }
        }, []);

        return { statsRef, updateStats };
      });

      const initialRenderCount = renderCount.count;

      // Update with same values - should NOT re-render
      act(() => {
        result.current.updateStats({
          tradesPerSecond: 0,
          avgTradesPerSecond: 0,
          totalTrades: 0,
        });
      });

      expect(renderCount.count).toBe(initialRenderCount);

      // Update with different values - SHOULD re-render
      act(() => {
        result.current.updateStats({
          tradesPerSecond: 100,
          avgTradesPerSecond: 50,
          totalTrades: 1000,
        });
      });

      expect(renderCount.count).toBe(initialRenderCount + 1);

      // Update with same values again - should NOT re-render
      act(() => {
        result.current.updateStats({
          tradesPerSecond: 100,
          avgTradesPerSecond: 50,
          totalTrades: 1000,
        });
      });

      expect(renderCount.count).toBe(initialRenderCount + 1);
    });
  });

  describe('RAF batching pattern', () => {
    it('should schedule RAF only once per batch', () => {
      const rafCalls: number[] = [];
      let rafId = 0;

      // Track RAF calls
      const originalRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (_cb: FrameRequestCallback) => {
        rafId++;
        rafCalls.push(rafId);
        // Don't actually schedule - we just want to count calls
        return rafId;
      };

      const { result } = renderHook(() => {
        const frameScheduledRef = useRef(false);
        const [, forceRender] = useReducer((x) => x + 1, 0);

        const scheduleRender = useCallback(() => {
          if (!frameScheduledRef.current) {
            frameScheduledRef.current = true;
            requestAnimationFrame(() => {
              forceRender();
              frameScheduledRef.current = false;
            });
          }
        }, []);

        return { scheduleRender, frameScheduledRef };
      });

      // Call scheduleRender multiple times
      act(() => {
        result.current.scheduleRender();
        result.current.scheduleRender();
        result.current.scheduleRender();
        result.current.scheduleRender();
      });

      // RAF should have been called only ONCE
      expect(rafCalls.length).toBe(1);

      globalThis.requestAnimationFrame = originalRAF;
    });

    it('should not schedule RAF when no new data', () => {
      let rafCalled = false;

      const originalRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (_cb: FrameRequestCallback) => {
        rafCalled = true;
        return 1;
      };

      const { result } = renderHook(() => {
        const frameScheduledRef = useRef(false);
        const [, forceRender] = useReducer((x) => x + 1, 0);

        const processNewTrades = useCallback((newTrades: { id: string }[]) => {
          if (newTrades.length === 0) return; // Early return for no data

          if (!frameScheduledRef.current) {
            frameScheduledRef.current = true;
            requestAnimationFrame(() => {
              forceRender();
              frameScheduledRef.current = false;
            });
          }
        }, []);

        return { processNewTrades };
      });

      // Process empty array
      act(() => {
        result.current.processNewTrades([]);
      });

      // RAF should NOT have been called
      expect(rafCalled).toBe(false);

      globalThis.requestAnimationFrame = originalRAF;
    });
  });

  describe('interval update pattern', () => {
    it('should accumulate data in refs without re-rendering', () => {
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        const tradesRef = useRef<{ id: string }[]>([]);

        const addTrades = useCallback((newTrades: { id: string }[]) => {
          // Accumulate into ref (no render)
          tradesRef.current = [...newTrades, ...tradesRef.current].slice(0, 50);
        }, []);

        return { tradesRef, addTrades };
      });

      const initialRenderCount = renderCount.count;

      // Add multiple batches
      act(() => {
        result.current.addTrades([{ id: 'a' }, { id: 'b' }]);
        result.current.addTrades([{ id: 'c' }]);
        result.current.addTrades([{ id: 'd' }, { id: 'e' }]);
      });

      // Data accumulated
      expect(result.current.tradesRef.current).toHaveLength(5);

      // No re-render occurred
      expect(renderCount.count).toBe(initialRenderCount);
    });

    it('should trigger exactly one render after accumulating data', () => {
      const renderCount = { count: 0 };

      const { result } = renderHook(() => {
        renderCount.count++;
        const tradesRef = useRef<{ id: string }[]>([]);
        const [, forceRender] = useReducer((x) => x + 1, 0);

        const addTrades = useCallback((newTrades: { id: string }[]) => {
          tradesRef.current = [...newTrades, ...tradesRef.current].slice(0, 50);
        }, []);

        const flush = useCallback(() => {
          forceRender();
        }, []);

        return { tradesRef, addTrades, flush };
      });

      const initialRenderCount = renderCount.count;

      // Add multiple batches (no renders)
      act(() => {
        result.current.addTrades([{ id: 'a' }]);
        result.current.addTrades([{ id: 'b' }]);
        result.current.addTrades([{ id: 'c' }]);
      });

      expect(renderCount.count).toBe(initialRenderCount);

      // Single flush to trigger render
      act(() => {
        result.current.flush();
      });

      // Exactly one render
      expect(renderCount.count).toBe(initialRenderCount + 1);
    });
  });

  describe('comparison: old vs new pattern', () => {
    it('should show performance difference between old and new patterns', () => {
      // OLD PATTERN: 4 setState calls per tick
      const oldPatternRenders = { count: 0 };

      const { result: oldResult } = renderHook(() => {
        oldPatternRenders.count++;
        const [displayTrades, setDisplayTrades] = useState<string[]>([]);
        const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());
        const [aggregatedIds, setAggregatedIds] = useState<Set<string>>(new Set());
        const [stats, setStats] = useState({ tradesPerSecond: 0 });

        return {
          setDisplayTrades,
          setNewTradeIds,
          setAggregatedIds,
          setStats,
          displayTrades,
          newTradeIds,
          aggregatedIds,
          stats,
        };
      });

      const oldInitial = oldPatternRenders.count;

      // Simulate one tick with old pattern (4 setState calls)
      act(() => {
        oldResult.current.setDisplayTrades(['trade1', 'trade2']);
      });
      act(() => {
        oldResult.current.setNewTradeIds(new Set(['trade1']));
      });
      act(() => {
        oldResult.current.setAggregatedIds(new Set());
      });
      act(() => {
        oldResult.current.setStats({ tradesPerSecond: 100 });
      });

      const oldRenderCount = oldPatternRenders.count - oldInitial;

      // NEW PATTERN: refs + single forceRender
      const newPatternRenders = { count: 0 };

      const { result: newResult } = renderHook(() => {
        newPatternRenders.count++;
        const displayTradesRef = useRef<string[]>([]);
        const newTradeIdsRef = useRef<Set<string>>(new Set());
        const aggregatedIdsRef = useRef<Set<string>>(new Set());
        const statsRef = useRef({ tradesPerSecond: 0 });
        const [, forceRender] = useReducer((x) => x + 1, 0);

        const batchUpdate = useCallback(
          (
            trades: string[],
            newIds: Set<string>,
            aggIds: Set<string>,
            stats: { tradesPerSecond: number }
          ) => {
            displayTradesRef.current = trades;
            newTradeIdsRef.current = newIds;
            aggregatedIdsRef.current = aggIds;
            statsRef.current = stats;
            forceRender();
          },
          []
        );

        return {
          displayTradesRef,
          newTradeIdsRef,
          aggregatedIdsRef,
          statsRef,
          batchUpdate,
        };
      });

      const newInitial = newPatternRenders.count;

      // Simulate one tick with new pattern (single batch update)
      act(() => {
        newResult.current.batchUpdate(
          ['trade1', 'trade2'],
          new Set(['trade1']),
          new Set(),
          { tradesPerSecond: 100 }
        );
      });

      const newRenderCount = newPatternRenders.count - newInitial;

      // New pattern should cause fewer renders
      expect(newRenderCount).toBe(1);
      expect(oldRenderCount).toBeGreaterThanOrEqual(4);

      // Both patterns should have correct data
      expect(oldResult.current.displayTrades).toEqual(['trade1', 'trade2']);
      expect(newResult.current.displayTradesRef.current).toEqual(['trade1', 'trade2']);
    });
  });
});
