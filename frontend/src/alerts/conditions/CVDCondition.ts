import type { AlertContext, Condition } from '../types';

type Comparator = '>' | '<' | '>=' | '<=';

export class CVDCondition implements Condition {
  constructor(
    private comparator: Comparator,
    private threshold: number
  ) {}

  evaluate(ctx: AlertContext): boolean {
    switch (this.comparator) {
      case '>':
        return ctx.cvd > this.threshold;
      case '<':
        return ctx.cvd < this.threshold;
      case '>=':
        return ctx.cvd >= this.threshold;
      case '<=':
        return ctx.cvd <= this.threshold;
      default:
        return false;
    }
  }

  describe(): string {
    const formatted = Math.abs(this.threshold) >= 1000000
      ? `${(this.threshold / 1000000).toFixed(1)}M`
      : Math.abs(this.threshold) >= 1000
      ? `${(this.threshold / 1000).toFixed(0)}K`
      : `${this.threshold}`;
    return `CVD ${this.comparator} ${formatted}`;
  }
}
