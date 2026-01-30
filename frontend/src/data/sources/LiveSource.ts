import type { Trade, OrderBook, Ticker } from '../../types';
import type { DataSource, DataSourceCallbacks, DataSourceStatus } from '../types';

export class LiveSource implements DataSource {
  readonly name = 'Binance Live';
  readonly type = 'live' as const;

  private _status: DataSourceStatus = 'disconnected';
  private callbacks: DataSourceCallbacks | null = null;
  private ws: WebSocket | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimeoutId: number | null = null;

  get status(): DataSourceStatus {
    return this._status;
  }

  setCallbacks(callbacks: DataSourceCallbacks): void {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    if (this._status === 'connected' || this._status === 'connecting') return;

    this._status = 'connecting';
    this.callbacks?.onStatusChange(this._status);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket('ws://localhost:3001');

        this.ws.onopen = () => {
          this._status = 'connected';
          this.reconnectAttempts = 0;
          this.callbacks?.onStatusChange(this._status);

          for (const symbol of this.subscribedSymbols) {
            this.sendSubscribe(symbol);
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = () => {
          this._status = 'error';
          this.callbacks?.onStatusChange(this._status);
          this.callbacks?.onError(new Error('WebSocket error'));
        };

        this.ws.onclose = () => {
          this._status = 'disconnected';
          this.callbacks?.onStatusChange(this._status);
          this.scheduleReconnect();
        };
      } catch (error) {
        this._status = 'error';
        this.callbacks?.onStatusChange(this._status);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this._status = 'disconnected';
    this.callbacks?.onStatusChange(this._status);
  }

  subscribe(symbol: string): void {
    const upperSymbol = symbol.toUpperCase();
    this.subscribedSymbols.add(upperSymbol);

    if (this._status === 'connected') {
      this.sendSubscribe(upperSymbol);
    }
  }

  unsubscribe(symbol: string): void {
    const upperSymbol = symbol.toUpperCase();
    this.subscribedSymbols.delete(upperSymbol);

    if (this._status === 'connected' && this.ws) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol: upperSymbol }));
    }
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  private sendSubscribe(symbol: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol, assetType: 'crypto' }));
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'trade':
          this.callbacks?.onTrade(msg.data as Trade);
          break;
        case 'orderbook':
          this.callbacks?.onOrderBook(msg.data as OrderBook);
          break;
        case 'ticker':
          this.callbacks?.onTicker(msg.data as Ticker);
          break;
        case 'error':
          this.callbacks?.onError(new Error(msg.error || 'Unknown error'));
          break;
      }
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }
}
