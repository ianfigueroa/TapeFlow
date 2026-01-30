import type { Trade, OrderBook, TradeWithAnalytics } from '../types';
import type { OrderBookSnapshot, LiquidityZone } from '../engine/types';
import type { CVDTimeframe } from './calculators/CVDCalculator';

import { OPSCalculator } from './calculators/OPSCalculator';
import { CVDCalculator } from './calculators/CVDCalculator';
import { SpreadAnalyzer } from './calculators/SpreadAnalyzer';
import { OBICalculator } from './calculators/OBICalculator';
import { VWAPCalculator } from './calculators/VWAPCalculator';
import { CircularBuffer } from './buffers/CircularBuffer';

export interface AnalyticsSnapshot {
  ops: number;
  opsAvg: number;
  cvd: Record<CVDTimeframe, number>;
  spread: {
    current: number;
    currentPercent: number;
    ma: number;
    stdev: number;
  };
  obi: number;
  obiPercent: number;
  vwap: number;
  vwapDrift: number;
  relativeStrength: number;
  liquidityZones: LiquidityZone[];
}

const OPS_UPDATE_INTERVAL_MS = 500;
const OB_BUFFER_SIZE = 100;

export class AnalyticsEngine {
  readonly symbol: string;

  private opsCalculator: OPSCalculator;
  private cvdCalculator: CVDCalculator;
  private spreadAnalyzer: SpreadAnalyzer;
  private obiCalculator: OBICalculator;
  private vwapCalculator: VWAPCalculator;

  private orderBookBuffer: CircularBuffer<OrderBookSnapshot>;
  private liquidityZones: LiquidityZone[] = [];

  private lastOpsUpdate: number = 0;
  private lastPrice: number = 0;

  constructor(symbol: string) {
    this.symbol = symbol.toUpperCase();

    this.opsCalculator = new OPSCalculator();
    this.cvdCalculator = new CVDCalculator();
    this.spreadAnalyzer = new SpreadAnalyzer();
    this.obiCalculator = new OBICalculator();
    this.vwapCalculator = new VWAPCalculator();

    this.orderBookBuffer = new CircularBuffer<OrderBookSnapshot>(OB_BUFFER_SIZE);
  }

  processTrade(trade: Trade): TradeWithAnalytics {
    this.opsCalculator.recordTrade(trade.timestamp);
    this.cvdCalculator.addTrade(trade.timestamp, trade.volume, trade.side as 'buy' | 'sell');
    this.vwapCalculator.addTrade(trade.price, trade.volume);
    this.lastPrice = trade.price;

    const now = Date.now();
    if (now - this.lastOpsUpdate > OPS_UPDATE_INTERVAL_MS) {
      this.opsCalculator.updateHistory();
      this.lastOpsUpdate = now;
    }

    const vwap = this.vwapCalculator.getValue();
    const vwapDrift = this.vwapCalculator.getDrift(trade.price);
    const delta = this.cvdCalculator.getSessionDelta();
    const relativeStrength = this.cvdCalculator.getRelativeStrength();
    const spreadAtPrint = this.spreadAnalyzer.getCurrentSpread();

    const enriched: TradeWithAnalytics = {
      ...trade,
      vwap,
      vwapDrift,
      delta,
      relativeStrength,
      momentum: 0,
      spreadAtPrint,
    };

    return enriched;
  }

  processOrderBook(orderBook: OrderBook): OrderBookSnapshot {
    this.spreadAnalyzer.update(orderBook.spread, orderBook.spreadPercent);
    this.obiCalculator.update(orderBook.bids, orderBook.asks);

    const midPrice = orderBook.bids.length > 0 && orderBook.asks.length > 0
      ? (orderBook.bids[0].price + orderBook.asks[0].price) / 2
      : 0;

    const snapshot: OrderBookSnapshot = {
      timestamp: orderBook.timestamp,
      bids: orderBook.bids.slice(0, 20),
      asks: orderBook.asks.slice(0, 20),
      midPrice,
    };

    this.orderBookBuffer.push(snapshot);

    return snapshot;
  }

  getSnapshot(): AnalyticsSnapshot {
    const opsStats = this.opsCalculator.getStats();
    const spreadStats = this.spreadAnalyzer.getStats();
    const obiStats = this.obiCalculator.getStats();
    const vwapStats = this.vwapCalculator.getStats(this.lastPrice);

    return {
      ops: opsStats.current,
      opsAvg: opsStats.avg,
      cvd: this.cvdCalculator.getAllDeltas(),
      spread: {
        current: spreadStats.current,
        currentPercent: spreadStats.currentPercent,
        ma: spreadStats.ma,
        stdev: spreadStats.stdev,
      },
      obi: obiStats.value,
      obiPercent: obiStats.valuePercent,
      vwap: vwapStats.vwap,
      vwapDrift: vwapStats.drift,
      relativeStrength: this.cvdCalculator.getRelativeStrength(),
      liquidityZones: this.liquidityZones,
    };
  }

  getOrderBookSnapshots(): OrderBookSnapshot[] {
    return this.orderBookBuffer.toArray();
  }

  getLatestOrderBookSnapshot(): OrderBookSnapshot | null {
    return this.orderBookBuffer.getLatest();
  }

  getCVD(tf: CVDTimeframe): number {
    return this.cvdCalculator.getDelta(tf);
  }

  getOPS(): number {
    return this.opsCalculator.getCurrentOPS();
  }

  getVWAP(): number {
    return this.vwapCalculator.getValue();
  }

  getOBI(): number {
    return this.obiCalculator.getValue();
  }

  setLiquidityZones(zones: LiquidityZone[]): void {
    this.liquidityZones = zones;
  }

  reset(): void {
    this.opsCalculator.reset();
    this.cvdCalculator.reset();
    this.spreadAnalyzer.reset();
    this.obiCalculator.reset();
    this.vwapCalculator.reset();
    this.orderBookBuffer.clear();
    this.liquidityZones = [];
    this.lastPrice = 0;
  }
}
