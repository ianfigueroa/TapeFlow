// Type definitions for trades, order book, signals, and app state

export type AssetType = 'crypto';

export type TradeSide = 'buy' | 'sell' | 'neutral';

export interface Trade {
  id: string;
  symbol: string;
  assetType: AssetType;
  timestamp: number;
  price: number;
  volume: number;
  side: TradeSide;
  exchange?: string;
}

/**
 * Single level in the order book
 */
export interface OrderBookLevel {
  price: number;
  size: number;
  count?: number;  // Number of orders at this level (not all exchanges provide this)
}

/**
 * Level 2 order book snapshot
 */
export interface OrderBook {
  symbol: string;
  assetType: AssetType;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
}

/**
 * 24-hour rolling statistics from the exchange
 * 
 * Used to display high/low/change in the header without calculating it ourselves.
 */
export interface Ticker {
  symbol: string;
  assetType: AssetType;
  timestamp: number;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  openPrice: number;
}

/**
 * Result of symbol validation
 */
export interface SymbolInfo {
  symbol: string;
  name: string;
  assetType: AssetType;
  exchange?: string;
  valid: boolean;
  error?: string;
}

/**
 * Trade with computed analytics
 * 
 * We calculate these values locally as trades come in. VWAP and delta are
 * particularly useful for reading order flow.
 */
export interface TradeWithAnalytics extends Trade {
  vwap: number;           // Volume-weighted average price
  vwapDrift: number;      // Current price deviation from VWAP
  delta: number;          // Cumulative buy volume - sell volume
  relativeStrength: number;  // Buy volume as % of total volume
  momentum: number;       // Recent price trend direction
  spreadAtPrint: number;  // Spread at time of trade (if available)
}

/**
 * All state we track for a single symbol
 */
export interface SymbolState {
  symbol: string;
  assetType: AssetType;
  name?: string;
  trades: TradeWithAnalytics[];
  orderBook: OrderBook | null;
  isLoading: boolean;
  error?: string;
  
  // Running analytics
  vwap: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  delta: number;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
}

/**
 * Messages we send to the backend
 */
export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'validate' | 'ping';
  symbol?: string;
  symbols?: string[];
  assetType?: AssetType;
}

/**
 * Messages we receive from the backend
 */
export interface ServerMessage {
  type: 'trade' | 'orderbook' | 'ticker' | 'validation' | 'error' | 'connected' | 'subscribed' | 'unsubscribed' | 'pong';
  data?: Trade | OrderBook | Ticker | SymbolInfo | SymbolInfo[];
  symbol?: string;
  error?: string;
  timestamp?: number;
}

/**
 * Data for a single tab in the UI
 */
export interface TabData {
  symbol: string;
  name?: string;
  assetType: AssetType;
}

/**
 * User preferences persisted in the store
 */
export interface LayoutSettings {
  combinedTape: boolean;  // Show all symbols in one tape
  darkMode: boolean;      // Theme (always dark for now)
  pauseScroll: boolean;   // Freeze the tape for inspection
  maxTrades: number;      // How many trades to keep in memory
}
