import type { OrderBook, OrderBookLevel } from '../../types';
import type { LiquidityZone } from '../../engine/types';

interface TrackedLevel {
  price: number;
  size: number;
  firstSeen: number;
  lastSeen: number;
  side: 'bid' | 'ask';
  peakSize: number;
}

const MIN_PERSISTENCE_MS = 300000;
const SIZE_MULTIPLIER = 3;
const PRUNE_INTERVAL_MS = 60000;

export class LiquidityZoneDetector {
  private trackedLevels: Map<number, TrackedLevel> = new Map();
  private activeZones: LiquidityZone[] = [];
  private averageBidSize: number = 0;
  private averageAskSize: number = 0;
  private lastPruneTime: number = 0;

  update(orderBook: OrderBook): LiquidityZone[] {
    const now = Date.now();

    this.updateAverageSizes(orderBook);
    this.processLevels(orderBook.bids, 'bid', now);
    this.processLevels(orderBook.asks, 'ask', now);

    if (now - this.lastPruneTime > PRUNE_INTERVAL_MS) {
      this.pruneStaleZones(now);
      this.lastPruneTime = now;
    }

    this.updateActiveZones(now);

    return this.activeZones;
  }

  private updateAverageSizes(orderBook: OrderBook): void {
    if (orderBook.bids.length > 0) {
      this.averageBidSize =
        orderBook.bids.reduce((sum, l) => sum + l.size, 0) / orderBook.bids.length;
    }
    if (orderBook.asks.length > 0) {
      this.averageAskSize =
        orderBook.asks.reduce((sum, l) => sum + l.size, 0) / orderBook.asks.length;
    }
  }

  private processLevels(levels: OrderBookLevel[], side: 'bid' | 'ask', now: number): void {
    const avgSize = side === 'bid' ? this.averageBidSize : this.averageAskSize;
    const threshold = avgSize * SIZE_MULTIPLIER;

    for (const level of levels) {
      if (level.size < threshold) continue;

      const existing = this.trackedLevels.get(level.price);

      if (existing) {
        existing.lastSeen = now;
        existing.size = level.size;
        existing.peakSize = Math.max(existing.peakSize, level.size);
      } else {
        this.trackedLevels.set(level.price, {
          price: level.price,
          size: level.size,
          firstSeen: now,
          lastSeen: now,
          side,
          peakSize: level.size,
        });
      }
    }
  }

  private pruneStaleZones(now: number): void {
    for (const [price, level] of this.trackedLevels) {
      if (now - level.lastSeen > 10000) {
        this.trackedLevels.delete(price);
      }
    }
  }

  private updateActiveZones(now: number): void {
    this.activeZones = [];

    for (const level of this.trackedLevels.values()) {
      const age = now - level.firstSeen;

      if (age >= MIN_PERSISTENCE_MS) {
        this.activeZones.push({
          price: level.price,
          size: level.peakSize,
          side: level.side,
          firstSeen: level.firstSeen,
          active: true,
        });
      }
    }

    this.activeZones.sort((a, b) => b.size - a.size);
  }

  getZones(): LiquidityZone[] {
    return this.activeZones;
  }

  getZonesNearPrice(price: number, range: number): LiquidityZone[] {
    return this.activeZones.filter(
      (z) => Math.abs(z.price - price) <= range
    );
  }

  getBidZones(): LiquidityZone[] {
    return this.activeZones.filter((z) => z.side === 'bid');
  }

  getAskZones(): LiquidityZone[] {
    return this.activeZones.filter((z) => z.side === 'ask');
  }

  getNearestBidZone(price: number): LiquidityZone | null {
    const bidZones = this.getBidZones()
      .filter((z) => z.price < price)
      .sort((a, b) => b.price - a.price);
    return bidZones[0] || null;
  }

  getNearestAskZone(price: number): LiquidityZone | null {
    const askZones = this.getAskZones()
      .filter((z) => z.price > price)
      .sort((a, b) => a.price - b.price);
    return askZones[0] || null;
  }

  reset(): void {
    this.trackedLevels.clear();
    this.activeZones = [];
    this.averageBidSize = 0;
    this.averageAskSize = 0;
  }
}
