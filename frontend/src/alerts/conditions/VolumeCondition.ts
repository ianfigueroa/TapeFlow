import type { AlertContext, Condition } from '../types';

type Comparator = '>' | '<' | '>=' | '<=';

export class VolumeCondition implements Condition {
  constructor(
    private comparator: Comparator,
    private threshold: number
  ) {}

  evaluate(ctx: AlertContext): boolean {
    const tradeValue = ctx.price * ctx.volume;

    switch (this.comparator) {
      case '>':
        return tradeValue > this.threshold;
      case '<':
        return tradeValue < this.threshold;
      case '>=':
        return tradeValue >= this.threshold;
      case '<=':
        return tradeValue <= this.threshold;
      default:
        return false;
    }
  }

  describe(): string {
    const formatted = this.threshold >= 1000000
      ? `$${(this.threshold / 1000000).toFixed(1)}M`
      : this.threshold >= 1000
      ? `$${(this.threshold / 1000).toFixed(0)}K`
      : `$${this.threshold}`;
    return `Trade Value ${this.comparator} ${formatted}`;
  }
}
