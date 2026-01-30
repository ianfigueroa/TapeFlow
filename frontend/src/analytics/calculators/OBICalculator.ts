import type { OrderBookLevel } from '../../types';

const DEFAULT_LEVELS = 10;

export class OBICalculator {
  private levels: number;
  private currentValue: number = 0;
  private bidVolume: number = 0;
  private askVolume: number = 0;

  constructor(levels: number = DEFAULT_LEVELS) {
    this.levels = levels;
  }

  update(bids: OrderBookLevel[], asks: OrderBookLevel[]): void {
    const bidLevels = bids.slice(0, this.levels);
    const askLevels = asks.slice(0, this.levels);

    this.bidVolume = bidLevels.reduce((sum, l) => sum + l.size, 0);
    this.askVolume = askLevels.reduce((sum, l) => sum + l.size, 0);

    const total = this.bidVolume + this.askVolume;
    this.currentValue = total > 0 ? (this.bidVolume - this.askVolume) / total : 0;
  }

  getValue(): number {
    return this.currentValue;
  }

  getValuePercent(): number {
    return this.currentValue * 100;
  }

  getBidVolume(): number {
    return this.bidVolume;
  }

  getAskVolume(): number {
    return this.askVolume;
  }

  getTotalVolume(): number {
    return this.bidVolume + this.askVolume;
  }

  getBias(): 'bullish' | 'bearish' | 'neutral' {
    if (this.currentValue > 0.2) return 'bullish';
    if (this.currentValue < -0.2) return 'bearish';
    return 'neutral';
  }

  getStats(): {
    value: number;
    valuePercent: number;
    bidVolume: number;
    askVolume: number;
    bias: 'bullish' | 'bearish' | 'neutral';
  } {
    return {
      value: this.currentValue,
      valuePercent: this.getValuePercent(),
      bidVolume: this.bidVolume,
      askVolume: this.askVolume,
      bias: this.getBias(),
    };
  }

  setLevels(levels: number): void {
    this.levels = levels;
  }

  reset(): void {
    this.currentValue = 0;
    this.bidVolume = 0;
    this.askVolume = 0;
  }
}
