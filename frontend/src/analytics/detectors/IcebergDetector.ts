import type { Trade, OrderBook, OrderBookLevel } from '../../types';

interface LevelTracker {
  price: number;
  lastSize: number;
  lastUpdateTime: number;
  refillCount: number;
  volumeTraded: number;
  side: 'bid' | 'ask';
}

export interface IcebergSignal {
  type: 'iceberg';
  price: number;
  side: 'bid' | 'ask';
  refillCount: number;
  estimatedHiddenSize: number;
  timestamp: number;
}

const REFILL_THRESHOLD = 3;
const TIME_WINDOW_MS = 5000;
const MIN_SIZE_THRESHOLD = 0.1;

export class IcebergDetector {
  private trackedLevels: Map<number, LevelTracker> = new Map();
  private signals: IcebergSignal[] = [];
  private signalCallbacks: Set<(signal: IcebergSignal) => void> = new Set();

  updateOrderBook(orderBook: OrderBook): void {
    const now = Date.now();

    this.processLevels(orderBook.bids, 'bid', now);
    this.processLevels(orderBook.asks, 'ask', now);

    this.pruneOldLevels(now);
  }

  private processLevels(levels: OrderBookLevel[], side: 'bid' | 'ask', now: number): void {
    for (const level of levels) {
      const tracker = this.trackedLevels.get(level.price);

      if (tracker) {
        if (level.size > tracker.lastSize && tracker.volumeTraded > 0) {
          const sizeIncrease = level.size - tracker.lastSize;
          if (sizeIncrease >= tracker.lastSize * MIN_SIZE_THRESHOLD) {
            tracker.refillCount++;
          }
        }
        tracker.lastSize = level.size;
        tracker.lastUpdateTime = now;
      } else {
        this.trackedLevels.set(level.price, {
          price: level.price,
          lastSize: level.size,
          lastUpdateTime: now,
          refillCount: 0,
          volumeTraded: 0,
          side,
        });
      }
    }
  }

  private pruneOldLevels(now: number): void {
    for (const [price, tracker] of this.trackedLevels) {
      if (now - tracker.lastUpdateTime > TIME_WINDOW_MS) {
        this.trackedLevels.delete(price);
      }
    }
  }

  checkTrade(trade: Trade): IcebergSignal | null {
    const tracker = this.trackedLevels.get(trade.price);
    if (!tracker) return null;

    tracker.volumeTraded += trade.volume;

    if (tracker.refillCount >= REFILL_THRESHOLD) {
      const signal: IcebergSignal = {
        type: 'iceberg',
        price: trade.price,
        side: tracker.side,
        refillCount: tracker.refillCount,
        estimatedHiddenSize: tracker.volumeTraded,
        timestamp: Date.now(),
      };

      this.signals.push(signal);
      if (this.signals.length > 100) this.signals.shift();

      for (const callback of this.signalCallbacks) {
        callback(signal);
      }

      tracker.refillCount = 0;
      tracker.volumeTraded = 0;

      return signal;
    }

    return null;
  }

  onSignal(callback: (signal: IcebergSignal) => void): () => void {
    this.signalCallbacks.add(callback);
    return () => this.signalCallbacks.delete(callback);
  }

  getRecentSignals(limit: number = 10): IcebergSignal[] {
    return this.signals.slice(-limit);
  }

  getTrackedLevels(): LevelTracker[] {
    return Array.from(this.trackedLevels.values());
  }

  getSuspiciousLevels(): LevelTracker[] {
    return this.getTrackedLevels().filter(
      (t) => t.refillCount >= 2 && t.volumeTraded > 0
    );
  }

  reset(): void {
    this.trackedLevels.clear();
    this.signals = [];
  }
}
