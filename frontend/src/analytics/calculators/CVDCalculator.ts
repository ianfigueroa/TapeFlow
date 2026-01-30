export type CVDTimeframe = 'session' | '1m' | '5m' | '15m';

interface TimeframeBucket {
  buyVolume: number;
  sellVolume: number;
  startTime: number;
}

const INTERVALS: Record<Exclude<CVDTimeframe, 'session'>, number> = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
};

export class CVDCalculator {
  private sessionBuy: number = 0;
  private sessionSell: number = 0;

  private buckets: Map<Exclude<CVDTimeframe, 'session'>, TimeframeBucket[]> = new Map([
    ['1m', []],
    ['5m', []],
    ['15m', []],
  ]);

  addTrade(timestamp: number, volume: number, side: 'buy' | 'sell'): void {
    if (side === 'buy') {
      this.sessionBuy += volume;
    } else {
      this.sessionSell += volume;
    }

    for (const [tf, buckets] of this.buckets) {
      const interval = INTERVALS[tf];
      const bucketTime = Math.floor(timestamp / interval) * interval;

      let current = buckets[buckets.length - 1];
      if (!current || current.startTime !== bucketTime) {
        current = { buyVolume: 0, sellVolume: 0, startTime: bucketTime };
        buckets.push(current);
        while (buckets.length > 2) buckets.shift();
      }

      if (side === 'buy') {
        current.buyVolume += volume;
      } else {
        current.sellVolume += volume;
      }
    }
  }

  getSessionDelta(): number {
    return this.sessionBuy - this.sessionSell;
  }

  getDelta(tf: CVDTimeframe): number {
    if (tf === 'session') return this.getSessionDelta();

    const buckets = this.buckets.get(tf);
    if (!buckets || buckets.length === 0) return 0;

    let buy = 0;
    let sell = 0;
    for (const b of buckets) {
      buy += b.buyVolume;
      sell += b.sellVolume;
    }
    return buy - sell;
  }

  getAllDeltas(): Record<CVDTimeframe, number> {
    return {
      session: this.getSessionDelta(),
      '1m': this.getDelta('1m'),
      '5m': this.getDelta('5m'),
      '15m': this.getDelta('15m'),
    };
  }

  getRelativeStrength(): number {
    const total = this.sessionBuy + this.sessionSell;
    if (total === 0) return 50;
    return (this.sessionBuy / total) * 100;
  }

  getTotalBuyVolume(): number {
    return this.sessionBuy;
  }

  getTotalSellVolume(): number {
    return this.sessionSell;
  }

  reset(tf?: CVDTimeframe): void {
    if (!tf || tf === 'session') {
      this.sessionBuy = 0;
      this.sessionSell = 0;
    }
    if (tf && tf !== 'session') {
      this.buckets.set(tf, []);
    } else if (!tf) {
      for (const key of this.buckets.keys()) {
        this.buckets.set(key, []);
      }
    }
  }
}
