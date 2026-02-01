const SLIDING_WINDOW_MS = 1000;
const MAX_TIMESTAMP_AGE_MS = 10000;
const MAX_HISTORY_SAMPLES = 10;

export class OPSCalculator {
  private timestamps: number[] = [];
  private history: number[] = [];
  private lastSampleTime: number = 0;

  recordTrade(timestamp: number): void {
    this.timestamps.push(timestamp);
    this.pruneOld(timestamp);
  }

  private pruneOld(now: number): void {
    const cutoff = now - MAX_TIMESTAMP_AGE_MS;
    const idx = this.binarySearchCutoff(cutoff);
    if (idx > 0) {
      this.timestamps.splice(0, idx);
    }
  }

  private binarySearchCutoff(cutoff: number): number {
    let left = 0;
    let right = this.timestamps.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.timestamps[mid] < cutoff) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  getCurrentOPS(): number {
    const now = Date.now();
    const windowStart = now - SLIDING_WINDOW_MS;

    const startIdx = this.binarySearchCutoff(windowStart);
    return this.timestamps.length - startIdx;
  }

  updateHistory(): void {
    const current = this.getCurrentOPS();
    this.history.push(current);
    if (this.history.length > MAX_HISTORY_SAMPLES) {
      this.history.shift();
    }
    this.lastSampleTime = Date.now();
  }

  getLastSampleTime(): number {
    return this.lastSampleTime;
  }

  getAverageOPS(): number {
    if (this.history.length === 0) return this.getCurrentOPS();
    return this.history.reduce((a, b) => a + b, 0) / this.history.length;
  }

  getStats(): { current: number; avg: number; history: number[] } {
    return {
      current: this.getCurrentOPS(),
      avg: this.getAverageOPS(),
      history: [...this.history],
    };
  }

  reset(): void {
    this.timestamps = [];
    this.history = [];
    this.lastSampleTime = 0;
  }
}
