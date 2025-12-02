// Shared types for trades, order book, tickers, and WebSocket messages

export type AssetType = 'crypto';

export type TradeSide = 'buy' | 'sell' | 'neutral';

/**
 * Individual trade from the exchange
 * 
 * Each trade represents a single fill on the order book. High-volume symbols like
 * BTCUSDT can push 500+ of these per second during volatile periods.
 */
export interface Trade {
  id: string;
  symbol: string;
  assetType: AssetType;
  timestamp: number;       // Unix ms from exchange
  price: number;
  volume: number;          // Base asset qty (e.g. 0.5 BTC)
  side: TradeSide;         // Who was the aggressor
  exchange?: string;
}

/**
 * Single price level in the order book
 * 
 * Represents resting liquidity at a specific price. Size is in base asset units.
 * Count is optional - Binance doesn't provide it, but some exchanges do.
 */
export interface OrderBookLevel {
  price: number;
  size: number;
  count?: number;  // Number of orders at this level (exchange-dependent)
}

/**
 * Level 2 order book snapshot
 * 
 * Contains top N bids and asks. We fetch 20 levels from Binance which is enough
 * to calculate imbalance and visualize depth without overwhelming the UI.
 */
export interface OrderBook {
  symbol: string;
  assetType: AssetType;
  timestamp: number;
  bids: OrderBookLevel[];  // Sorted high to low
  asks: OrderBookLevel[];  // Sorted low to high
  spread: number;          // Absolute: bestAsk - bestBid
  spreadPercent: number;   // Relative to mid price
}

/**
 * 24-hour rolling ticker statistics
 * 
 * Binance sends these on a ticker stream. Useful for the header display -
 * shows daily high/low/change without us having to calculate it ourselves.
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
  volume: number;          // 24h volume in base asset
  quoteVolume: number;     // 24h volume in quote (USDT)
  openPrice: number;
}

/**
 * Symbol validation result
 * 
 * Returned when client asks us to check if a symbol is tradeable.
 * We hit Binance's exchangeInfo endpoint to verify.
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
 * Interface that all exchange adapters must implement
 * 
 * The idea is to make it easy to add other exchanges later (Coinbase, Kraken, etc)
 * without changing the server code. Each adapter handles its own WebSocket quirks.
 */
export interface MarketDataAdapter {
  name: string;
  supportedAssetTypes: AssetType[];
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  subscribe(symbol: string, assetType: AssetType): Promise<void>;
  unsubscribe(symbol: string): Promise<void>;
  
  // Event handlers - register these before calling connect()
  onTrade(callback: (trade: Trade) => void): void;
  onOrderBook(callback: (orderBook: OrderBook) => void): void;
  onTicker(callback: (ticker: Ticker) => void): void;
  onError(callback: (error: Error) => void): void;
  onConnect(callback: () => void): void;
  onDisconnect(callback: () => void): void;
  
  validateSymbol(symbol: string): Promise<SymbolInfo>;
}

/**
 * Binance connection config
 * 
 * Keys are optional - the public WebSocket streams work without auth.
 * You'd only need keys for authenticated endpoints like placing orders.
 */
export interface BinanceConfig {
  apiKey?: string;
  apiSecret?: string;
}

/**
 * Messages the client can send to us
 */
export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'validate' | 'ping';
  symbol?: string;
  symbols?: string[];   // For batch subscribe/unsubscribe
  assetType?: AssetType;
}

/**
 * Messages we send back to clients
 * 
 * The 'data' field type depends on message type:
 * - trade: Trade
 * - orderbook: OrderBook  
 * - ticker: Ticker
 * - validation: SymbolInfo
 */
export interface ServerMessage {
  type: 'trade' | 'orderbook' | 'ticker' | 'validation' | 'error' | 'connected' | 'subscribed' | 'unsubscribed' | 'pong';
  data?: Trade | OrderBook | Ticker | SymbolInfo | SymbolInfo[];
  symbol?: string;
  error?: string;
  timestamp?: number;
}
