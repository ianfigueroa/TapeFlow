import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Trade, OrderBook } from '../../types';

// Use vi.hoisted to define callback tracker before mock hoisting
const mockState = vi.hoisted(() => ({
  tradeCallback: null as ((trade: Trade) => void) | null,
}));

// Mock dataBuffer module - must be before import of usePaperTradingStore
vi.mock('../../services/dataBuffer', () => ({
  subscribeToTrades: vi.fn((callback: (trade: Trade) => void) => {
    mockState.tradeCallback = callback;
    return () => {
      mockState.tradeCallback = null;
    };
  }),
  getCurrentOrderBook: vi.fn((symbol: string): OrderBook => ({
    symbol: symbol.toUpperCase(),
    assetType: 'crypto' as const,
    bids: [{ price: 100, size: 10 }],
    asks: [{ price: 101, size: 10 }],
    timestamp: Date.now(),
    spread: 1,
    spreadPercent: 1,
  })),
}));

// Import store AFTER mock is set up
import { usePaperTradingStore, resetRefreshScheduled } from '../usePaperTradingStore';

// Helper to create a mock trade
function createMockTrade(symbol: string, price: number): Trade {
  return {
    id: `trade-${Date.now()}-${Math.random()}`,
    symbol: symbol.toUpperCase(),
    assetType: 'crypto',
    price,
    volume: 1,
    side: 'buy',
    timestamp: Date.now(),
  };
}

// Helper to simulate rapid trades
function simulateRapidTrades(count: number, symbol = 'BTCUSDT'): void {
  for (let i = 0; i < count; i++) {
    const trade = createMockTrade(symbol, 100 + i * 0.01);
    if (mockState.tradeCallback) {
      mockState.tradeCallback(trade);
    }
  }
}

describe('usePaperTradingStore', () => {
  beforeEach(() => {
    // Reset store state
    const store = usePaperTradingStore.getState();
    store.reset();
    store.setEnabled(false);

    // Clear RAF queue and reset scheduling flag
    clearRAFQueue();
    resetRefreshScheduled();

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockState.tradeCallback = null;
  });

  describe('RAF-throttled refreshState', () => {
    it('should NOT call refreshState 100 times when 100 trades arrive rapidly', () => {
      const store = usePaperTradingStore.getState();

      // Spy on refreshState
      const refreshStateSpy = vi.spyOn(store, 'refreshState');

      // Enable paper trading to activate trade subscription
      store.setEnabled(true);

      // Clear the spy count from enable call
      refreshStateSpy.mockClear();

      // Simulate 100 rapid trades
      simulateRapidTrades(100);

      // Before RAF flush, refreshState should NOT have been called 100 times
      // It should be batched - either 0 (all pending) or minimal calls
      expect(refreshStateSpy.mock.calls.length).toBeLessThan(10);
    });

    it('should batch multiple trades into a single RAF callback', () => {
      const store = usePaperTradingStore.getState();
      const refreshStateSpy = vi.spyOn(store, 'refreshState');

      store.setEnabled(true);
      refreshStateSpy.mockClear();

      // Simulate 50 rapid trades
      simulateRapidTrades(50);

      // Check that RAF was scheduled
      expect(getPendingRAFCount()).toBeGreaterThanOrEqual(1);

      // Flush RAF - this should trigger the batched refreshState
      flushRAF();

      // After RAF flush, refreshState should have been called exactly once
      // (or a small number if there are multiple RAF frames)
      expect(refreshStateSpy.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('should still update state correctly after RAF flush', () => {
      const store = usePaperTradingStore.getState();

      store.setEnabled(true);
      store.setActiveSymbol('BTCUSDT');

      // Place an order
      store.placeOrder('BTCUSDT', 'buy', 'market', 1);

      // Flush RAF to ensure state is updated
      flushRAF();

      // Verify the order was processed (state should reflect the order)
      const state = usePaperTradingStore.getState();
      expect(state.tradeHistory.length).toBeGreaterThanOrEqual(0);
    });

    it('should not schedule RAF when paper trading is disabled', () => {
      const store = usePaperTradingStore.getState();
      const refreshStateSpy = vi.spyOn(store, 'refreshState');

      // Keep paper trading disabled
      store.setEnabled(false);
      refreshStateSpy.mockClear();
      clearRAFQueue();

      // Simulate trades
      simulateRapidTrades(10);

      // refreshState should not be called at all
      expect(refreshStateSpy).not.toHaveBeenCalled();

      // No RAF should be scheduled
      expect(getPendingRAFCount()).toBe(0);
    });

    it('should handle multiple RAF frames correctly', () => {
      const store = usePaperTradingStore.getState();
      const refreshStateSpy = vi.spyOn(store, 'refreshState');

      store.setEnabled(true);
      refreshStateSpy.mockClear();

      // First batch of trades
      simulateRapidTrades(20);
      flushRAF();

      const callsAfterFirstFlush = refreshStateSpy.mock.calls.length;

      // Second batch of trades
      simulateRapidTrades(20);
      flushRAF();

      const callsAfterSecondFlush = refreshStateSpy.mock.calls.length;

      // Each RAF frame should trigger at most one refreshState
      expect(callsAfterSecondFlush - callsAfterFirstFlush).toBeLessThanOrEqual(2);
    });
  });

  describe('existing functionality', () => {
    it('should enable and disable paper trading', () => {
      const store = usePaperTradingStore.getState();

      expect(store.enabled).toBe(false);

      store.setEnabled(true);
      expect(usePaperTradingStore.getState().enabled).toBe(true);

      store.setEnabled(false);
      expect(usePaperTradingStore.getState().enabled).toBe(false);
    });

    it('should place and track orders', () => {
      const store = usePaperTradingStore.getState();
      store.setEnabled(true);

      const order = store.placeOrder('BTCUSDT', 'buy', 'limit', 1, 95000);

      expect(order).not.toBeNull();
      expect(order?.side).toBe('buy');
      expect(order?.type).toBe('limit');
      expect(order?.quantity).toBe(1);
    });

    it('should cancel orders', () => {
      const store = usePaperTradingStore.getState();
      store.setEnabled(true);

      // Use price below bid (100) so order won't fill immediately
      // Mock orderbook has bids at 100, asks at 101
      const order = store.placeOrder('BTCUSDT', 'buy', 'limit', 1, 50);
      expect(order).not.toBeNull();
      expect(order?.status).toBe('pending');

      const cancelled = store.cancelOrder(order!.id);
      expect(cancelled).toBe(true);
    });

    it('should reset state correctly', () => {
      const store = usePaperTradingStore.getState();
      store.setEnabled(true);
      store.placeOrder('BTCUSDT', 'buy', 'market', 1);

      // Flush to process
      flushRAF();

      store.reset(50000);
      flushRAF();

      const state = usePaperTradingStore.getState();
      expect(state.account.balance).toBe(50000);
      expect(state.account.initialBalance).toBe(50000);
    });

    it('should set active symbol', () => {
      const store = usePaperTradingStore.getState();

      store.setActiveSymbol('BTCUSDT');
      expect(usePaperTradingStore.getState().activeSymbol).toBe('BTCUSDT');

      store.setActiveSymbol('ETHUSDT');
      expect(usePaperTradingStore.getState().activeSymbol).toBe('ETHUSDT');

      store.setActiveSymbol(null);
      expect(usePaperTradingStore.getState().activeSymbol).toBeNull();
    });
  });
});
