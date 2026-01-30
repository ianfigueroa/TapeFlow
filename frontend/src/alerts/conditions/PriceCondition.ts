import type { AlertContext, Condition } from '../types';

type Comparator = '>' | '<' | '>=' | '<=' | '==';
type Reference = 'vwap' | 'number';

export class PriceCondition implements Condition {
  constructor(
    private comparator: Comparator,
    private reference: Reference,
    private value?: number
  ) {}

  evaluate(ctx: AlertContext): boolean {
    const target = this.reference === 'vwap' ? ctx.vwap : this.value!;

    switch (this.comparator) {
      case '>':
        return ctx.price > target;
      case '<':
        return ctx.price < target;
      case '>=':
        return ctx.price >= target;
      case '<=':
        return ctx.price <= target;
      case '==':
        return Math.abs(ctx.price - target) < 0.01;
      default:
        return false;
    }
  }

  describe(): string {
    const targetStr = this.reference === 'vwap' ? 'VWAP' : `$${this.value}`;
    return `Price ${this.comparator} ${targetStr}`;
  }
}
