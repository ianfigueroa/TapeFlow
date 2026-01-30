import { CircularBuffer } from '../buffers/CircularBuffer';

const WINDOW_SIZE = 60;

interface SpreadSample {
  spread: number;
  spreadPercent: number;
  timestamp: number;
}

export class SpreadAnalyzer {
  private samples: CircularBuffer<SpreadSample>;
  private currentSpread: number = 0;
  private currentSpreadPercent: number = 0;

  constructor() {
    this.samples = new CircularBuffer<SpreadSample>(WINDOW_SIZE);
  }

  update(spread: number, spreadPercent: number, timestamp?: number): void {
    this.currentSpread = spread;
    this.currentSpreadPercent = spreadPercent;

    this.samples.push({
      spread,
      spreadPercent,
      timestamp: timestamp || Date.now(),
    });
  }

  getCurrentSpread(): number {
    return this.currentSpread;
  }

  getCurrentSpreadPercent(): number {
    return this.currentSpreadPercent;
  }

  getMovingAverage(): number {
    const arr = this.samples.toArray();
    if (arr.length === 0) return 0;
    return arr.reduce((sum, s) => sum + s.spread, 0) / arr.length;
  }

  getMovingAveragePercent(): number {
    const arr = this.samples.toArray();
    if (arr.length === 0) return 0;
    return arr.reduce((sum, s) => sum + s.spreadPercent, 0) / arr.length;
  }

  getStdev(): number {
    const arr = this.samples.toArray();
    if (arr.length < 2) return 0;

    const mean = this.getMovingAverage();
    const squaredDiffs = arr.map(s => (s.spread - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(variance);
  }

  getStdevPercent(): number {
    const arr = this.samples.toArray();
    if (arr.length < 2) return 0;

    const mean = this.getMovingAveragePercent();
    const squaredDiffs = arr.map(s => (s.spreadPercent - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(variance);
  }

  getStats(): {
    current: number;
    currentPercent: number;
    ma: number;
    maPercent: number;
    stdev: number;
    stdevPercent: number;
  } {
    return {
      current: this.currentSpread,
      currentPercent: this.currentSpreadPercent,
      ma: this.getMovingAverage(),
      maPercent: this.getMovingAveragePercent(),
      stdev: this.getStdev(),
      stdevPercent: this.getStdevPercent(),
    };
  }

  isWide(): boolean {
    const current = this.currentSpread;
    const ma = this.getMovingAverage();
    const stdev = this.getStdev();
    return current > ma + 2 * stdev;
  }

  reset(): void {
    this.samples.clear();
    this.currentSpread = 0;
    this.currentSpreadPercent = 0;
  }
}
