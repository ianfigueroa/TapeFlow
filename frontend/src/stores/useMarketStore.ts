// Central state store - manages WebSocket, symbols, trades, order book, and signals

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  Trade,
  OrderBook,
  Ticker,
  SymbolInfo,
  SymbolState,
  TradeWithAnalytics,
  TabData,
  LayoutSettings,
  AssetType,
  ServerMessage,
} from '../types';
import { enrichTradeWithAnalytics, resetAnalytics } from '../utils/calculations';
import { pushTrade, pushOrderBook, pushTicker, pushToCombinedBuffer } from '../services/dataBuffer';

interface MarketStore {
  // Connection
  isConnected: boolean;
  connectionError: string | null;
  reconnectAttempts: number;
  ws: WebSocket | null;
  
  // Market data
  symbols: Map<string, SymbolState>;
  activeSymbols: string[];
  selectedSymbol: string | null;
  tabs: TabData[];
  combinedTrades: TradeWithAnalytics[];
  
  // Settings
  settings: LayoutSettings;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  subscribe: (symbol: string, assetType?: AssetType) => void;
  unsubscribe: (symbol: string) => void;
  validateSymbol: (symbol: string) => Promise<SymbolInfo | null>;
  selectSymbol: (symbol: string | null) => void;
  addTab: (tab: TabData) => void;
  removeTab: (symbol: string) => void;
  updateSettings: (settings: Partial<LayoutSettings>) => void;
  clearTrades: (symbol?: string) => void;
  
  // Internal
  _handleMessage: (event: MessageEvent) => void;
  _handleTrade: (trade: Trade) => void;
  _handleOrderBook: (orderBook: OrderBook) => void;
  _reconnect: () => void;
}

// Config
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const MAX_TRADES = 500;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 1000;

export const useMarketStore = create<MarketStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
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
      maxTrades: MAX_TRADES,
    },
    
    /**
     * Connect to the WebSocket server
     */
    connect: () => {
      const { ws, isConnected } = get();
      
      if (ws && isConnected) {
        console.log('Already connected');
        return;
      }
      
      try {
        console.log(`Connecting to ${WS_URL}...`);
        const newWs = new WebSocket(WS_URL);
        
        newWs.onopen = () => {
          console.log('WebSocket connected');
          set({
            ws: newWs,
            isConnected: true,
            connectionError: null,
            reconnectAttempts: 0,
          });
          
          // Resubscribe to any symbols we were watching before disconnect
          const { activeSymbols, symbols } = get();
          for (const symbol of activeSymbols) {
            const state = symbols.get(symbol);
            if (state) {
              newWs.send(JSON.stringify({
                type: 'subscribe',
                symbol,
                assetType: state.assetType,
              }));
            }
          }
        };
        
        newWs.onmessage = (event) => {
          get()._handleMessage(event);
        };
        
        newWs.onerror = (error) => {
          console.error('WebSocket error:', error);
          set({ connectionError: 'Connection error' });
        };
        
        newWs.onclose = () => {
          console.log('WebSocket disconnected');
          set({ isConnected: false, ws: null });
          get()._reconnect();
        };
        
        set({ ws: newWs });
      } catch (error) {
        console.error('Failed to connect:', error);
        set({ connectionError: 'Failed to connect' });
      }
    },
    
    /**
     * Disconnect and stop auto-reconnect
     */
    disconnect: () => {
      const { ws } = get();
      if (ws) {
        ws.close();
      }
      set({
        ws: null,
        isConnected: false,
        reconnectAttempts: MAX_RECONNECT_ATTEMPTS, // Prevent auto-reconnect
      });
    },
    
    /**
     * Attempt reconnection with exponential backoff
     */
    _reconnect: () => {
      const { reconnectAttempts, isConnected } = get();
      
      if (isConnected || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        return;
      }
      
      const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
      
      set({ reconnectAttempts: reconnectAttempts + 1 });
      
      setTimeout(() => {
        get().connect();
      }, delay);
    },
    
    /**
     * Route incoming WebSocket messages to appropriate handlers
     */
    _handleMessage: (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'trade':
            if (message.data) {
              get()._handleTrade(message.data as Trade);
            }
            break;
          case 'orderbook':
            if (message.data) {
              get()._handleOrderBook(message.data as OrderBook);
            }
            break;
          case 'ticker':
            if (message.data) {
              // Ticker goes straight to buffer - no state update
              pushTicker(message.data as Ticker);
            }
            break;
          case 'subscribed':
            console.log(`Subscribed to ${message.symbol}`);
            break;
          case 'unsubscribed':
            console.log(`Unsubscribed from ${message.symbol}`);
            break;
          case 'error':
            console.error('Server error:', message.error);
            break;
          case 'connected':
            console.log('Server confirmed connection');
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    },
    
    /**
     * Handle incoming trade
     * 
     * PERFORMANCE-CRITICAL PATH - Every microsecond matters here.
     * 
     * Key insight: We push to the buffer, NOT React state. This avoids
     * triggering reconciliation on every trade. The UI polls the buffer
     * at 60fps, batching hundreds of trades into one re-render.
     * 
     * What we DO update (cheap):
     * - Last price (primitive, no re-render cascade)
     * - Buy/sell volume accumulators (primitives)
     * 
     * What we DON'T update (expensive):
     * - trades[] array (would trigger array diff in React)
     * - Any nested objects (would trigger deep comparison)
     */
    _handleTrade: (trade: Trade) => {
      const { symbols, settings } = get();
      const symbol = trade.symbol.toUpperCase();
      
      // Create symbol state if this is the first trade
      let state = symbols.get(symbol);
      if (!state) {
        state = {
          symbol,
          assetType: trade.assetType,
          trades: [],
          orderBook: null,
          isLoading: false,
          vwap: 0,
          totalBuyVolume: 0,
          totalSellVolume: 0,
          delta: 0,
          lastPrice: trade.price,
          priceChange: 0,
          priceChangePercent: 0,
          highPrice: trade.price,
          lowPrice: trade.price,
        };
        symbols.set(symbol, state);
        set({ symbols: new Map(symbols) });
      }
      
      // Push to buffer - NO React re-render here!
      pushTrade(trade);
      
      // Also add to combined buffer if that mode is enabled
      if (settings.combinedTape) {
        const enrichedTrade = enrichTradeWithAnalytics(trade, state.orderBook);
        pushToCombinedBuffer(enrichedTrade);
      }
      
      // Update price tracking (this is fast, minimal state)
      const priceChange = trade.price - (state.lastPrice || trade.price);
      if (Math.abs(priceChange) > 0) {
        state.lastPrice = trade.price;
        state.priceChange = priceChange;
        state.priceChangePercent = state.lastPrice ? (priceChange / state.lastPrice) * 100 : 0;
        
        if (trade.side === 'buy') {
          state.totalBuyVolume += trade.volume;
        } else if (trade.side === 'sell') {
          state.totalSellVolume += trade.volume;
        }
      }
    },
    
    /**
     * Handle incoming order book update
     * Same deal as trades - goes to buffer, not React state
     */
    _handleOrderBook: (orderBook: OrderBook) => {
      pushOrderBook(orderBook);
      
      // Ensure symbol state exists
      const { symbols } = get();
      const symbol = orderBook.symbol.toUpperCase();
      
      if (!symbols.has(symbol)) {
        const state: SymbolState = {
          symbol,
          assetType: orderBook.assetType,
          trades: [],
          orderBook: null,
          isLoading: false,
          vwap: 0,
          totalBuyVolume: 0,
          totalSellVolume: 0,
          delta: 0,
          lastPrice: 0,
          priceChange: 0,
          priceChangePercent: 0,
          highPrice: 0,
          lowPrice: 0,
        };
        symbols.set(symbol, state);
        set({ symbols: new Map(symbols) });
      }
    },
    
    /**
     * Subscribe to a symbol's market data
     */
    subscribe: (symbol: string, assetType?: AssetType) => {
      const { ws, activeSymbols, symbols, isConnected } = get();
      const upperSymbol = symbol.toUpperCase();
      
      if (activeSymbols.includes(upperSymbol)) {
        console.log(`Already subscribed to ${upperSymbol}`);
        return;
      }
      
      // Detect asset type from symbol pattern if not specified
      const detectedType = assetType || detectAssetType(upperSymbol);
      
      const state: SymbolState = {
        symbol: upperSymbol,
        assetType: detectedType,
        trades: [],
        orderBook: null,
        isLoading: true,
        vwap: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        delta: 0,
        lastPrice: 0,
        priceChange: 0,
        priceChangePercent: 0,
        highPrice: 0,
        lowPrice: 0,
      };
      
      symbols.set(upperSymbol, state);
      
      set({
        symbols: new Map(symbols),
        activeSymbols: [...activeSymbols, upperSymbol],
      });
      
      // Tell the server to start streaming
      if (ws && isConnected) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          symbol: upperSymbol,
          assetType: detectedType,
        }));
      }
    },
    
    /**
     * Unsubscribe from a symbol
     */
    unsubscribe: (symbol: string) => {
      const { ws, activeSymbols, symbols, tabs, selectedSymbol, isConnected } = get();
      const upperSymbol = symbol.toUpperCase();
      
      const newActiveSymbols = activeSymbols.filter(s => s !== upperSymbol);
      symbols.delete(upperSymbol);
      resetAnalytics(upperSymbol);
      
      const newTabs = tabs.filter(t => t.symbol !== upperSymbol);
      
      // Select a different symbol if we just closed the active one
      let newSelectedSymbol = selectedSymbol;
      if (selectedSymbol === upperSymbol) {
        newSelectedSymbol = newActiveSymbols[0] || null;
      }
      
      set({
        symbols: new Map(symbols),
        activeSymbols: newActiveSymbols,
        tabs: newTabs,
        selectedSymbol: newSelectedSymbol,
      });
      
      if (ws && isConnected) {
        ws.send(JSON.stringify({
          type: 'unsubscribe',
          symbol: upperSymbol,
        }));
      }
    },
    
    /**
     * Validate a symbol before subscribing
     */
    validateSymbol: async (symbol: string): Promise<SymbolInfo | null> => {
      const { ws, isConnected } = get();
      
      if (!ws || !isConnected) {
        return null;
      }
      
      return new Promise((resolve) => {
        const upperSymbol = symbol.toUpperCase();
        
        const handler = (event: MessageEvent) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            if (message.type === 'validation') {
              ws.removeEventListener('message', handler);
              resolve(message.data as SymbolInfo);
            }
          } catch (error) {
            // Ignore parse errors
          }
        };
        
        ws.addEventListener('message', handler);
        
        ws.send(JSON.stringify({
          type: 'validate',
          symbol: upperSymbol,
        }));
        
        // Don't wait forever
        setTimeout(() => {
          ws.removeEventListener('message', handler);
          resolve(null);
        }, 5000);
      });
    },
    
    selectSymbol: (symbol: string | null) => {
      set({ selectedSymbol: symbol?.toUpperCase() || null });
    },
    
    addTab: (tab: TabData) => {
      const { tabs } = get();
      const upperSymbol = tab.symbol.toUpperCase();
      
      if (tabs.some(t => t.symbol === upperSymbol)) {
        return;
      }
      
      set({
        tabs: [...tabs, { ...tab, symbol: upperSymbol }],
        selectedSymbol: upperSymbol,
      });
    },
    
    removeTab: (symbol: string) => {
      get().unsubscribe(symbol);
    },
    
    updateSettings: (newSettings: Partial<LayoutSettings>) => {
      const { settings } = get();
      set({ settings: { ...settings, ...newSettings } });
    },
    
    /**
     * Clear trade history (optionally for a specific symbol)
     */
    clearTrades: (symbol?: string) => {
      const { symbols } = get();
      
      if (symbol) {
        const state = symbols.get(symbol.toUpperCase());
        if (state) {
          state.trades = [];
          resetAnalytics(symbol.toUpperCase());
          set({ symbols: new Map(symbols) });
        }
      } else {
        // Clear all
        for (const state of symbols.values()) {
          state.trades = [];
          resetAnalytics(state.symbol);
        }
        set({
          symbols: new Map(symbols),
          combinedTrades: [],
        });
      }
    },
  }))
);

/**
 * Asset type is always crypto since we only support Binance
 */
function detectAssetType(_symbol: string): AssetType {
  return 'crypto';
}

// ============================================================================
// Selector Hooks - Extract specific pieces of state for components
// ============================================================================

export const useSymbolData = (symbol: string) => 
  useMarketStore((state) => state.symbols.get(symbol.toUpperCase()));

export const useOrderBook = (symbol: string) =>
  useMarketStore((state) => state.symbols.get(symbol.toUpperCase())?.orderBook);

export const useTrades = (symbol: string) =>
  useMarketStore((state) => state.symbols.get(symbol.toUpperCase())?.trades || []);

export const useIsConnected = () =>
  useMarketStore((state) => state.isConnected);

export const useActiveSymbols = () =>
  useMarketStore((state) => state.activeSymbols);

export const useSelectedSymbol = () =>
  useMarketStore((state) => state.selectedSymbol);

export const useSettings = () =>
  useMarketStore((state) => state.settings);

export const useCombinedTrades = () =>
  useMarketStore((state) => state.combinedTrades);
