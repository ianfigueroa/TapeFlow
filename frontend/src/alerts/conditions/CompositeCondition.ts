import type { AlertContext, Condition } from '../types';

type Operator = 'AND' | 'OR';

export class CompositeCondition implements Condition {
  constructor(
    private operator: Operator,
    private conditions: Condition[]
  ) {
    if (conditions.length < 2) {
      throw new Error('CompositeCondition requires at least 2 conditions');
    }
  }

  evaluate(ctx: AlertContext): boolean {
    if (this.operator === 'AND') {
      return this.conditions.every((c) => c.evaluate(ctx));
    }
    return this.conditions.some((c) => c.evaluate(ctx));
  }

  describe(): string {
    const parts = this.conditions.map((c) => c.describe());
    return `(${parts.join(` ${this.operator} `)})`;
  }

  getConditions(): Condition[] {
    return this.conditions;
  }

  getOperator(): Operator {
    return this.operator;
  }
}
