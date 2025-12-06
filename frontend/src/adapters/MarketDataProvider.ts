// Market data provider interface and adapters for dual-mode architecture

import { Trade, OrderBook, Ticker } from '../types';

// Common interface for all market data sources
export interface MarketDataProvider {
  readonly name: string;
  readonly isConnected: boolean;
  
  connect(): Promise<void>;
  disconnect(): void;
  
  subscribe(symbol: string): void;
  unsubscribe(symbol: string): void;
  
  // Event handlers
  onTrade(callback: (trade: Trade) => void): () => void;
  onOrderBook(callback: (orderBook: OrderBook) => void): () => void;
  onTicker(callback: (ticker: Ticker) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  onConnectionChange(callback: (connected: boolean) => void): () => void;
}

// Telemetry data from C++ engine
export interface SimulationTelemetry {
  type: 'telemetry';
  timestamp: number;
  symbol: string;
  price: number;
  high: number;
  low: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  midPrice: number;
  ordersPerSecond: number;
  totalOrders: number;
  totalTrades: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

// Simulation adapter - connects to C++ Hyperion engine
export class SimulationAdapter implements MarketDataProvider {
  readonly name = 'Hyperion Simulation';
  
  private ws: WebSocket | null = null;
  private _isConnected = false;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  private tradeCallbacks: Set<(trade: Trade) => void> = new Set();
  private orderBookCallbacks: Set<(orderBook: OrderBook) => void> = new Set();
  private tickerCallbacks: Set<(ticker: Ticker) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private connectionCallbacks: Set<(connected: boolean) => void> = new Set();
  
  private lastTradeId = 0;
  
  constructor(url = 'ws://localhost:9001') {
    this.url = url;
  }
  
  get isConnected(): boolean {
    return this._isConnected;
  }
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this._isConnected = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionChange(true);
          resolve();
        };
        
        this.ws.onclose = () => {
          this._isConnected = false;
          this.notifyConnectionChange(false);
          this.attemptReconnect();
        };
        
        this.ws.onerror = () => {
          const error = new Error('WebSocket connection error');
          this.notifyError(error);
          if (!this._isConnected) {
            reject(error);
          }
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.notifyConnectionChange(false);
  }
  
  subscribe(_symbol: string): void {
    // C++ engine broadcasts all data, no subscription message needed
  }
  
  unsubscribe(_symbol: string): void {
    // No action needed
  }
  
  onTrade(callback: (trade: Trade) => void): () => void {
    this.tradeCallbacks.add(callback);
    return () => this.tradeCallbacks.delete(callback);
  }
  
  onOrderBook(callback: (orderBook: OrderBook) => void): () => void {
    this.orderBookCallbacks.add(callback);
    return () => this.orderBookCallbacks.delete(callback);
  }
  
  onTicker(callback: (ticker: Ticker) => void): () => void {
    this.tickerCallbacks.add(callback);
    return () => this.tickerCallbacks.delete(callback);
  }
  
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }
  
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }
  
  private handleMessage(data: string): void {
    try {
      const telemetry: SimulationTelemetry = JSON.parse(data);
      
      if (telemetry.type !== 'telemetry') return;
      
      // Convert to Trade (synthetic from price changes)
      const trade: Trade = {
        id: `sim-${++this.lastTradeId}`,
        symbol: telemetry.symbol,
        assetType: 'crypto',
        timestamp: telemetry.timestamp,
        price: telemetry.price,
        volume: Math.random() * 2, // Synthetic volume
        side: Math.random() > 0.5 ? 'buy' : 'sell',
      };
      this.notifyTrade(trade);
      
      // Convert to OrderBook
      const spread = telemetry.bestAsk - telemetry.bestBid;
      const spreadPercent = telemetry.bestBid > 0 ? (spread / telemetry.bestBid) * 100 : 0;
      
      const orderBook: OrderBook = {
        symbol: telemetry.symbol,
        assetType: 'crypto',
        timestamp: telemetry.timestamp,
        bids: telemetry.bids.map(b => ({ price: b.price, size: b.size })),
        asks: telemetry.asks.map(a => ({ price: a.price, size: a.size })),
        spread,
        spreadPercent,
      };
      this.notifyOrderBook(orderBook);
      
      // Convert to Ticker
      const startPrice = 92000;
      const ticker: Ticker = {
        symbol: telemetry.symbol,
        assetType: 'crypto',
        timestamp: telemetry.timestamp,
        lastPrice: telemetry.price,
        priceChange: telemetry.price - startPrice,
        priceChangePercent: ((telemetry.price - startPrice) / startPrice) * 100,
        highPrice: telemetry.high,
        lowPrice: telemetry.low,
        volume: telemetry.totalTrades,
        quoteVolume: telemetry.totalTrades * telemetry.price,
        openPrice: startPrice,
      };
      this.notifyTicker(ticker);
      
    } catch (error) {
      this.notifyError(error as Error);
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    
    this.reconnectAttempts++;
    setTimeout(() => {
      this.connect().catch(() => {
        // Will trigger another reconnect attempt via onclose
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }
  
  private notifyTrade(trade: Trade): void {
    this.tradeCallbacks.forEach(cb => cb(trade));
  }
  
  private notifyOrderBook(orderBook: OrderBook): void {
    this.orderBookCallbacks.forEach(cb => cb(orderBook));
  }
  
  private notifyTicker(ticker: Ticker): void {
    this.tickerCallbacks.forEach(cb => cb(ticker));
  }
  
  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(cb => cb(error));
  }
  
  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(cb => cb(connected));
  }
}

// Factory function to create the appropriate adapter
export type DataSourceMode = 'LIVE' | 'SIM';

export function createMarketDataProvider(mode: DataSourceMode): MarketDataProvider | null {
  switch (mode) {
    case 'SIM':
      return new SimulationAdapter('ws://localhost:9001');
    case 'LIVE':
      // Live mode uses the existing Zustand store + backend
      // Return null to indicate use existing infrastructure
      return null;
    default:
      return null;
  }
}
