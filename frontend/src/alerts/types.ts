export interface AlertContext {
  price: number;
  vwap: number;
  obi: number;
  cvd: number;
  ops: number;
  spread: number;
  spreadPercent: number;
  volume: number;
  side?: 'buy' | 'sell';
  timestamp: number;
}

export interface Condition {
  evaluate(context: AlertContext): boolean;
  describe(): string;
}

export type AlertActionType = 'sound' | 'notification' | 'highlight' | 'log';

export interface AlertAction {
  type: AlertActionType;
  payload?: any;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: Condition;
  actions: AlertAction[];
  cooldownMs: number;
  enabled: boolean;
}

export interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  message: string;
  context: AlertContext;
  timestamp: number;
}

export interface AlertRuleState extends AlertRule {
  lastTriggered: number;
  triggerCount: number;
}
