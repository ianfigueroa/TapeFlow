import type { AlertRule } from './types';
import { PriceCondition } from './conditions/PriceCondition';
import { OBICondition } from './conditions/OBICondition';
import { VolumeCondition } from './conditions/VolumeCondition';
import { OPSCondition } from './conditions/OPSCondition';
import { CompositeCondition } from './conditions/CompositeCondition';

export const PRESET_RULES: AlertRule[] = [
  {
    id: 'bullish-setup',
    name: 'Bullish Setup',
    condition: new CompositeCondition('AND', [
      new PriceCondition('>', 'vwap'),
      new OBICondition('>', 0.3),
    ]),
    actions: [{ type: 'notification' }, { type: 'highlight' }],
    cooldownMs: 60000,
    enabled: false,
  },
  {
    id: 'bearish-setup',
    name: 'Bearish Setup',
    condition: new CompositeCondition('AND', [
      new PriceCondition('<', 'vwap'),
      new OBICondition('<', -0.3),
    ]),
    actions: [{ type: 'notification' }, { type: 'highlight' }],
    cooldownMs: 60000,
    enabled: false,
  },
  {
    id: 'whale-buy',
    name: 'Whale Buy',
    condition: new VolumeCondition('>', 100000),
    actions: [{ type: 'notification' }, { type: 'sound' }],
    cooldownMs: 5000,
    enabled: false,
  },
  {
    id: 'high-velocity',
    name: 'High Velocity',
    condition: new OPSCondition('>', 100),
    actions: [{ type: 'notification' }],
    cooldownMs: 30000,
    enabled: false,
  },
  {
    id: 'strong-bid-imbalance',
    name: 'Strong Bid Imbalance',
    condition: new OBICondition('>', 0.5),
    actions: [{ type: 'highlight' }],
    cooldownMs: 15000,
    enabled: false,
  },
  {
    id: 'strong-ask-imbalance',
    name: 'Strong Ask Imbalance',
    condition: new OBICondition('<', -0.5),
    actions: [{ type: 'highlight' }],
    cooldownMs: 15000,
    enabled: false,
  },
];

export function loadPresets(engine: { addRule: (rule: AlertRule) => void }): void {
  for (const rule of PRESET_RULES) {
    engine.addRule({ ...rule });
  }
}
