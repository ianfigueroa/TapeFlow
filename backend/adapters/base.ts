// Base adapter class - interface for exchange connections with callback system

import { Trade, OrderBook, Ticker, SymbolInfo, AssetType, MarketDataAdapter } from '../types';

export abstract class BaseAdapter implements MarketDataAdapter {
  abstract name: string;
  abstract supportedAssetTypes: AssetType[];
  
  protected connected: boolean = false;
  protected subscriptions: Set<string> = new Set();
  
  // Callback arrays for each event type
  private tradeCallbacks: ((trade: Trade) => void)[] = [];
  private orderBookCallbacks: ((orderBook: OrderBook) => void)[] = [];
  private tickerCallbacks: ((ticker: Ticker) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private connectCallbacks: (() => void)[] = [];
  private disconnectCallbacks: (() => void)[] = [];
  
  // Reconnection handling
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Base delay in ms

  // These must be implemented by subclasses
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract subscribe(symbol: string, assetType: AssetType): Promise<void>;
  abstract unsubscribe(symbol: string): Promise<void>;
  abstract validateSymbol(symbol: string): Promise<SymbolInfo>;

  // Register event listeners
  onTrade(callback: (trade: Trade) => void): void {
    this.tradeCallbacks.push(callback);
  }

  onOrderBook(callback: (orderBook: OrderBook) => void): void {
    this.orderBookCallbacks.push(callback);
  }

  onTicker(callback: (ticker: Ticker) => void): void {
    this.tickerCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  // Emit events to all registered listeners
  protected emitTrade(trade: Trade): void {
    this.tradeCallbacks.forEach(cb => cb(trade));
  }

  protected emitOrderBook(orderBook: OrderBook): void {
    this.orderBookCallbacks.forEach(cb => cb(orderBook));
  }

  protected emitTicker(ticker: Ticker): void {
    this.tickerCallbacks.forEach(cb => cb(ticker));
  }

  protected emitError(error: Error): void {
    this.errorCallbacks.forEach(cb => cb(error));
  }

  protected emitConnect(): void {
    this.connected = true;
    this.reconnectAttempts = 0; // Reset counter on successful connect
    this.connectCallbacks.forEach(cb => cb());
  }

  protected emitDisconnect(): void {
    this.connected = false;
    this.disconnectCallbacks.forEach(cb => cb());
  }

  /**
   * Attempt to reconnect with exponential backoff
   * 
   * Delay doubles each attempt: 1s -> 2s -> 4s -> 8s -> 16s...
   * Gives up after 10 attempts to avoid infinite loops.
   */
  protected attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[${this.name}] Max reconnect attempts reached`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[${this.name}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        // Re-subscribe to everything we were watching before
        for (const symbol of this.subscriptions) {
          await this.subscribe(symbol, 'crypto');
        }
      } catch (error) {
        console.error(`[${this.name}] Reconnect failed:`, error);
        this.attemptReconnect();
      }
    }, delay);
  }

  protected clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Generate a unique trade ID when the exchange doesn't provide one
   */
  protected generateTradeId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
