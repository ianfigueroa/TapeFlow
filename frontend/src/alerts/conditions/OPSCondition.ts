import type { AlertContext, Condition } from '../types';

type Comparator = '>' | '<' | '>=' | '<=';

export class OPSCondition implements Condition {
  constructor(
    private comparator: Comparator,
    private threshold: number
  ) {}

  evaluate(ctx: AlertContext): boolean {
    switch (this.comparator) {
      case '>':
        return ctx.ops > this.threshold;
      case '<':
        return ctx.ops < this.threshold;
      case '>=':
        return ctx.ops >= this.threshold;
      case '<=':
        return ctx.ops <= this.threshold;
      default:
        return false;
    }
  }

  describe(): string {
    return `OPS ${this.comparator} ${this.threshold}/s`;
  }
}
