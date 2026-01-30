export class VWAPCalculator {
  private numerator: number = 0;
  private denominator: number = 0;
  private lastPrice: number = 0;

  addTrade(price: number, volume: number): number {
    this.numerator += price * volume;
    this.denominator += volume;
    this.lastPrice = price;
    return this.getValue();
  }

  getValue(): number {
    if (this.denominator === 0) return this.lastPrice;
    return this.numerator / this.denominator;
  }

  getDrift(currentPrice: number): number {
    const vwap = this.getValue();
    if (vwap === 0) return 0;
    return ((currentPrice - vwap) / vwap) * 100;
  }

  getTotalVolume(): number {
    return this.denominator;
  }

  getTotalValue(): number {
    return this.numerator;
  }

  getStats(currentPrice?: number): {
    vwap: number;
    drift: number;
    totalVolume: number;
    position: 'above' | 'below' | 'at';
  } {
    const vwap = this.getValue();
    const price = currentPrice ?? this.lastPrice;
    const drift = this.getDrift(price);

    let position: 'above' | 'below' | 'at' = 'at';
    if (drift > 0.01) position = 'above';
    else if (drift < -0.01) position = 'below';

    return {
      vwap,
      drift,
      totalVolume: this.denominator,
      position,
    };
  }

  reset(): void {
    this.numerator = 0;
    this.denominator = 0;
    this.lastPrice = 0;
  }
}
