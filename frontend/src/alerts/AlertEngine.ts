import type {
  AlertContext,
  AlertRule,
  AlertRuleState,
  TriggeredAlert,
} from './types';

export class AlertEngine {
  private rules: Map<string, AlertRuleState> = new Map();
  private listeners: Set<(alert: TriggeredAlert) => void> = new Set();
  private history: TriggeredAlert[] = [];
  private maxHistory: number = 100;

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, {
      ...rule,
      lastTriggered: 0,
      triggerCount: 0,
    });
  }

  removeRule(id: string): void {
    this.rules.delete(id);
  }

  updateRule(id: string, updates: Partial<AlertRule>): void {
    const existing = this.rules.get(id);
    if (existing) {
      Object.assign(existing, updates);
    }
  }

  enableRule(id: string): void {
    const rule = this.rules.get(id);
    if (rule) rule.enabled = true;
  }

  disableRule(id: string): void {
    const rule = this.rules.get(id);
    if (rule) rule.enabled = false;
  }

  evaluate(context: AlertContext): TriggeredAlert[] {
    const triggered: TriggeredAlert[] = [];
    const now = Date.now();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (now - rule.lastTriggered < rule.cooldownMs) continue;

      if (rule.condition.evaluate(context)) {
        rule.lastTriggered = now;
        rule.triggerCount++;

        const alert: TriggeredAlert = {
          ruleId: rule.id,
          ruleName: rule.name,
          message: rule.condition.describe(),
          context,
          timestamp: now,
        };

        triggered.push(alert);
        this.history.push(alert);

        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }

        this.notifyListeners(alert);
      }
    }

    return triggered;
  }

  private notifyListeners(alert: TriggeredAlert): void {
    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch (e) {
        console.error('Alert listener error:', e);
      }
    }
  }

  onAlert(callback: (alert: TriggeredAlert) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getRule(id: string): AlertRuleState | undefined {
    return this.rules.get(id);
  }

  getRules(): AlertRuleState[] {
    return Array.from(this.rules.values());
  }

  getEnabledRules(): AlertRuleState[] {
    return this.getRules().filter((r) => r.enabled);
  }

  getHistory(limit?: number): TriggeredAlert[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  resetRuleCooldowns(): void {
    for (const rule of this.rules.values()) {
      rule.lastTriggered = 0;
    }
  }

  getStats(): {
    totalRules: number;
    enabledRules: number;
    totalTriggers: number;
    historySize: number;
  } {
    const rules = this.getRules();
    return {
      totalRules: rules.length,
      enabledRules: rules.filter((r) => r.enabled).length,
      totalTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
      historySize: this.history.length,
    };
  }

  reset(): void {
    this.rules.clear();
    this.history = [];
  }
}
