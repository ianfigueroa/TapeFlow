// Global Paper Trading State - wired to live market data

import { create } from 'zustand';
import { PaperTradingEngine } from '../paper/PaperTradingEngine';
import { subscribeToTrades, getCurrentOrderBook } from '../services/dataBuffer';
import type { Position, PaperOrder, TradeRecord, AccountState, OrderSide, OrderType } from '../paper/types';

interface PaperTradingState {
  enabled: boolean;
  engine: PaperTradingEngine;
  activeSymbol: string | null;

  // Derived state (for React re-renders)
  account: AccountState;
  position: Position | null;
  openOrders: PaperOrder[];
  tradeHistory: TradeRecord[];
  equity: number;
  winRate: number;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setActiveSymbol: (symbol: string | null) => void;
  placeOrder: (symbol: string, side: OrderSide, type: OrderType, quantity: number, price?: number) => PaperOrder | null;
  cancelOrder: (orderId: string) => boolean;
  flattenPosition: (symbol: string) => void;
  reset: (initialBalance?: number) => void;
  refreshState: () => void;
}

// Create singleton engine instance
const engine = new PaperTradingEngine(100000);

// Track subscription cleanup
let unsubscribe: (() => void) | null = null;

// RAF-throttling state for batching high-frequency trade updates
// At 500+ trades/sec, we batch state updates to 60fps via requestAnimationFrame
let refreshScheduled = false;

export const usePaperTradingStore = create<PaperTradingState>((set, get) => {
  // Schedule a batched refresh via RAF (for high-frequency trade stream)
  const scheduleRefresh = () => {
    if (!refreshScheduled) {
      refreshScheduled = true;
      requestAnimationFrame(() => {
        refreshScheduled = false;
        get().refreshState();
      });
    }
  };

  // Subscribe to trade stream for real-time updates
  const setupTradeSubscription = () => {
    if (unsubscribe) {
      unsubscribe();
    }

    unsubscribe = subscribeToTrades((trade) => {
      const state = get();
      if (!state.enabled) return;

      // Get current order book for best bid/ask
      const orderBook = getCurrentOrderBook(trade.symbol);
      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = orderBook.bids[0].price;
        const bestAsk = orderBook.asks[0].price;

        // Process market data for order fills and position updates
        engine.processMarketData(trade.symbol, bestBid, bestAsk);

        // Schedule batched refresh (RAF-throttled for 60fps)
        scheduleRefresh();
      }
    });
  };

  // Initial subscription setup
  setupTradeSubscription();

  // Engine update listener for order fills
  engine.onUpdate(() => {
    get().refreshState();
  });

  return {
    enabled: false,
    engine,
    activeSymbol: null,

    // Initial derived state
    account: engine.getAccount(),
    position: null,
    openOrders: [],
    tradeHistory: [],
    equity: engine.getTotalEquity(),
    winRate: engine.getWinRate(),

    setEnabled: (enabled) => {
      set({ enabled });
      if (enabled) {
        setupTradeSubscription();
      }
    },

    setActiveSymbol: (symbol) => {
      const position = symbol ? engine.getPosition(symbol) : null;
      set({ activeSymbol: symbol, position: position || null });
    },

    placeOrder: (symbol, side, type, quantity, price) => {
      const state = get();
      if (!state.enabled) return null;

      const order = engine.placeOrder(symbol, side, type, quantity, price);

      // Immediately try to fill if we have market data
      const orderBook = getCurrentOrderBook(symbol);
      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        engine.processMarketData(symbol, orderBook.bids[0].price, orderBook.asks[0].price);
      }

      state.refreshState();
      return order;
    },

    cancelOrder: (orderId) => {
      const result = engine.cancelOrder(orderId);
      get().refreshState();
      return result;
    },

    flattenPosition: (symbol) => {
      const position = engine.getPosition(symbol);
      if (!position || position.side === 'flat') return;

      const closeSide: OrderSide = position.side === 'long' ? 'sell' : 'buy';
      engine.placeOrder(symbol, closeSide, 'market', position.quantity);

      const orderBook = getCurrentOrderBook(symbol);
      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        engine.processMarketData(symbol, orderBook.bids[0].price, orderBook.asks[0].price);
      }

      get().refreshState();
    },

    reset: (initialBalance = 100000) => {
      engine.reset(initialBalance);
      get().refreshState();
    },

    refreshState: () => {
      const state = get();
      const position = state.activeSymbol ? engine.getPosition(state.activeSymbol) : null;

      set({
        account: engine.getAccount(),
        position: position || null,
        openOrders: engine.getOpenOrders(),
        tradeHistory: engine.getTradeHistory(),
        equity: engine.getTotalEquity(),
        winRate: engine.getWinRate(),
      });
    },
  };
});

// Export helper to get current OPS (for status bar)
export function getPaperTradingEngine(): PaperTradingEngine {
  return engine;
}

// Export helper to reset RAF scheduling state (for tests)
export function resetRefreshScheduled(): void {
  refreshScheduled = false;
}
