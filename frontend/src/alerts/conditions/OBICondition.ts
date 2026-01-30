import type { AlertContext, Condition } from '../types';

type Comparator = '>' | '<' | '>=' | '<=';

export class OBICondition implements Condition {
  constructor(
    private comparator: Comparator,
    private threshold: number
  ) {}

  evaluate(ctx: AlertContext): boolean {
    switch (this.comparator) {
      case '>':
        return ctx.obi > this.threshold;
      case '<':
        return ctx.obi < this.threshold;
      case '>=':
        return ctx.obi >= this.threshold;
      case '<=':
        return ctx.obi <= this.threshold;
      default:
        return false;
    }
  }

  describe(): string {
    const sign = this.threshold >= 0 ? '+' : '';
    return `OBI ${this.comparator} ${sign}${(this.threshold * 100).toFixed(0)}%`;
  }
}
