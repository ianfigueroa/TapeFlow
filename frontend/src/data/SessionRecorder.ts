import type { Trade, OrderBook } from '../types';
import type { RecordedSession } from './types';

const MAX_TRADES = 100000;
const MAX_OB_SNAPSHOTS = 10000;
const OB_SNAPSHOT_INTERVAL_MS = 500;

export class SessionRecorder {
  private symbol: string;
  private startTime: number;
  private trades: Trade[] = [];
  private orderBookSnapshots: Array<{ timestamp: number; orderBook: OrderBook }> = [];
  private lastOBSnapshotTime: number = 0;
  private isRecording: boolean = false;

  constructor(symbol: string) {
    this.symbol = symbol.toUpperCase();
    this.startTime = Date.now();
  }

  start(): void {
    this.isRecording = true;
    this.startTime = Date.now();
    this.trades = [];
    this.orderBookSnapshots = [];
    this.lastOBSnapshotTime = 0;
  }

  stop(): void {
    this.isRecording = false;
  }

  recordTrade(trade: Trade): void {
    if (!this.isRecording) return;
    if (this.trades.length >= MAX_TRADES) return;

    this.trades.push({ ...trade });
  }

  recordOrderBook(orderBook: OrderBook): void {
    if (!this.isRecording) return;
    if (this.orderBookSnapshots.length >= MAX_OB_SNAPSHOTS) return;

    const now = Date.now();
    if (now - this.lastOBSnapshotTime < OB_SNAPSHOT_INTERVAL_MS) return;

    this.lastOBSnapshotTime = now;
    this.orderBookSnapshots.push({
      timestamp: now,
      orderBook: {
        ...orderBook,
        bids: orderBook.bids.slice(0, 20),
        asks: orderBook.asks.slice(0, 20),
      },
    });
  }

  getSession(): RecordedSession {
    const endTime = this.trades.length > 0
      ? this.trades[this.trades.length - 1].timestamp
      : Date.now();

    return {
      id: `session-${this.startTime}`,
      symbol: this.symbol,
      startTime: this.startTime,
      endTime,
      trades: [...this.trades],
      orderBookSnapshots: [...this.orderBookSnapshots],
      metadata: {
        description: `Recorded session for ${this.symbol}`,
      },
    };
  }

  getStats(): {
    symbol: string;
    duration: number;
    tradeCount: number;
    snapshotCount: number;
    isRecording: boolean;
  } {
    const now = Date.now();
    return {
      symbol: this.symbol,
      duration: now - this.startTime,
      tradeCount: this.trades.length,
      snapshotCount: this.orderBookSnapshots.length,
      isRecording: this.isRecording,
    };
  }

  isActive(): boolean {
    return this.isRecording;
  }

  clear(): void {
    this.trades = [];
    this.orderBookSnapshots = [];
    this.startTime = Date.now();
    this.lastOBSnapshotTime = 0;
  }
}
