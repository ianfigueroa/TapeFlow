import type { Trade, OrderBook, Ticker } from '../types';

export type DataSourceType = 'live' | 'replay' | 'simulation';

export interface DataSourceCallbacks {
  onTrade: (trade: Trade) => void;
  onOrderBook: (orderBook: OrderBook) => void;
  onTicker: (ticker: Ticker) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: DataSourceStatus) => void;
}

export type DataSourceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DataSource {
  readonly name: string;
  readonly type: DataSourceType;
  readonly status: DataSourceStatus;

  connect(): Promise<void>;
  disconnect(): void;
  subscribe(symbol: string): void;
  unsubscribe(symbol: string): void;
  getSubscribedSymbols(): string[];
}

export interface RecordedSession {
  id: string;
  symbol: string;
  startTime: number;
  endTime: number;
  trades: Trade[];
  orderBookSnapshots: Array<{ timestamp: number; orderBook: OrderBook }>;
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

export interface PlaybackState {
  isPlaying: boolean;
  speed: number;
  currentTime: number;
  startTime: number;
  endTime: number;
  progress: number;
}
