/**
 * AlertsPanel - Alert Management and Notifications UI
 * 
 * Allows users to create, manage, and view alerts for:
 * - Price level alerts
 * - Volume spike alerts
 * - Liquidation alerts
 * 
 * Displays toast notifications when alerts trigger
 */

import { useState, useEffect, useCallback, memo } from 'react';
import { cn } from '../lib/utils';
import { useTheme } from '../hooks/useTheme';
import { AlertEngine } from '../alerts/AlertEngine';
import { PriceCondition, VolumeCondition } from '../alerts/conditions';
import { PRESET_RULES } from '../alerts/presets';
import type { AlertRule, TriggeredAlert, AlertContext } from '../alerts/types';

// Singleton alert engine instance
const alertEngine = new AlertEngine();

// Initialize with preset rules
PRESET_RULES.forEach(rule => alertEngine.addRule({ ...rule }));

interface AlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrice?: number;
  symbol?: string;
}

interface NewAlertForm {
  type: 'price' | 'volume' | 'liquidation';
  direction: 'above' | 'below';
  value: string;
  name: string;
}

// Bell icon
const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

// Toast notification component
const Toast = memo(function Toast({ 
  alert, 
  onDismiss 
}: { 
  alert: TriggeredAlert; 
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="bg-gray-900 border border-[#00FF41]/50 rounded-lg shadow-lg shadow-[#00FF41]/20 p-3 max-w-sm animate-slide-in">
      <div className="flex items-start gap-2">
        <div className="text-[#00FF41]">
          <BellIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold font-mono text-[#00FF41]">
            {alert.ruleName}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
            {alert.message}
          </div>
          <div className="text-[9px] text-gray-600 font-mono mt-1">
            Price: ${alert.context.price.toFixed(2)}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
});

// Toast container for notifications
export const AlertToastContainer = memo(function AlertToastContainer() {
  const [toasts, setToasts] = useState<TriggeredAlert[]>([]);

  useEffect(() => {
    const unsubscribe = alertEngine.onAlert((alert) => {
      setToasts(prev => [...prev, alert]);
    });
    return unsubscribe;
  }, []);

  const dismissToast = useCallback((timestamp: number) => {
    setToasts(prev => prev.filter(t => t.timestamp !== timestamp));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast 
          key={toast.timestamp} 
          alert={toast} 
          onDismiss={() => dismissToast(toast.timestamp)}
        />
      ))}
    </div>
  );
});

// Export the alert engine for external use
export function getAlertEngine(): AlertEngine {
  return alertEngine;
}

// Evaluate alerts from external data
export function evaluateAlerts(context: AlertContext): void {
  alertEngine.evaluate(context);
}

export const AlertsPanel = memo(function AlertsPanel({ 
  isOpen, 
  onClose,
  currentPrice = 0,
  symbol = 'BTCUSDT'
}: AlertsPanelProps) {
  const { isHacker } = useTheme();
  const accentColor = isHacker ? '#00FF00' : '#58a6ff';
  
  const [rules, setRules] = useState(alertEngine.getRules());
  const [history, setHistory] = useState(alertEngine.getHistory(20));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewAlertForm>({
    type: 'price',
    direction: 'above',
    value: currentPrice.toString(),
    name: '',
  });

  // Refresh state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setRules(alertEngine.getRules());
      setHistory(alertEngine.getHistory(20));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update form value when price changes
  useEffect(() => {
    if (currentPrice > 0 && form.value === '0') {
      setForm(f => ({ ...f, value: currentPrice.toString() }));
    }
  }, [currentPrice, form.value]);

  const handleToggleRule = useCallback((id: string) => {
    const rule = alertEngine.getRule(id);
    if (rule) {
      if (rule.enabled) {
        alertEngine.disableRule(id);
      } else {
        alertEngine.enableRule(id);
      }
      setRules(alertEngine.getRules());
    }
  }, []);

  const handleDeleteRule = useCallback((id: string) => {
    alertEngine.removeRule(id);
    setRules(alertEngine.getRules());
  }, []);

  const handleCreateAlert = useCallback(() => {
    const value = parseFloat(form.value);
    if (isNaN(value) || value <= 0) return;

    const id = `custom-${Date.now()}`;
    const name = form.name || `${symbol} ${form.direction} $${value}`;

    let condition;
    if (form.type === 'price') {
      // PriceCondition(comparator, reference, value?)
      const comparator = form.direction === 'above' ? '>' : '<';
      condition = new PriceCondition(comparator, 'number', value);
    } else if (form.type === 'volume') {
      // VolumeCondition(comparator, threshold)
      condition = new VolumeCondition('>', value);
    } else {
      // Liquidation uses volume condition for now
      condition = new VolumeCondition('>', value);
    }

    const rule: AlertRule = {
      id,
      name,
      condition,
      actions: [{ type: 'notification' }, { type: 'sound' }],
      cooldownMs: 60000, // 1 minute cooldown
      enabled: true,
    };

    alertEngine.addRule(rule);
    setRules(alertEngine.getRules());
    setShowForm(false);
    setForm({
      type: 'price',
      direction: 'above',
      value: currentPrice.toString(),
      name: '',
    });
  }, [form, symbol, currentPrice]);

  // Handle escape to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div 
        className="bg-[#0a0a0a] border border-gray-800 rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider flex items-center gap-2" style={{ color: accentColor }}>
            <BellIcon />
            Alerts
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-2 py-1 text-xs font-mono rounded border transition-colors"
              style={{ 
                borderColor: accentColor, 
                color: accentColor,
              }}
            >
              + NEW ALERT
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* New Alert Form */}
        {showForm && (
          <div className="p-4 border-b border-gray-800 bg-gray-900/30">
            <div className="grid grid-cols-2 gap-3">
              {/* Alert Type */}
              <div>
                <label className="text-[10px] font-mono text-gray-500 uppercase">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm(f => ({ ...f, type: e.target.value as any }))}
                  className="w-full mt-1 px-2 py-1.5 bg-black border border-gray-700 rounded text-xs font-mono text-white"
                >
                  <option value="price">Price Level</option>
                  <option value="volume">Volume Spike</option>
                  <option value="liquidation">Liquidation</option>
                </select>
              </div>

              {/* Direction (for price alerts) */}
              {form.type === 'price' && (
                <div>
                  <label className="text-[10px] font-mono text-gray-500 uppercase">Direction</label>
                  <select
                    value={form.direction}
                    onChange={(e) => setForm(f => ({ ...f, direction: e.target.value as any }))}
                    className="w-full mt-1 px-2 py-1.5 bg-black border border-gray-700 rounded text-xs font-mono text-white"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                </div>
              )}

              {/* Value */}
              <div>
                <label className="text-[10px] font-mono text-gray-500 uppercase">
                  {form.type === 'price' ? 'Price' : form.type === 'volume' ? 'Volume ($)' : 'Amount ($)'}
                </label>
                <input
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-black border border-gray-700 rounded text-xs font-mono text-white"
                  placeholder="0"
                />
              </div>

              {/* Name */}
              <div>
                <label className="text-[10px] font-mono text-gray-500 uppercase">Name (optional)</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-black border border-gray-700 rounded text-xs font-mono text-white"
                  placeholder="Auto-generated"
                />
              </div>
            </div>

            <button
              onClick={handleCreateAlert}
              className="w-full mt-3 py-2 text-xs font-mono font-bold rounded transition-colors"
              style={{ 
                backgroundColor: accentColor, 
                color: 'black',
              }}
            >
              CREATE ALERT
            </button>
          </div>
        )}

        {/* Active Rules */}
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-gray-500 mb-3">
            Active Alerts ({rules.filter(r => r.enabled).length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {rules.length === 0 ? (
              <p className="text-xs text-gray-600 font-mono">No alerts configured</p>
            ) : (
              rules.map((rule) => (
                <div 
                  key={rule.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded border transition-colors",
                    rule.enabled 
                      ? "border-gray-700 bg-gray-900/50" 
                      : "border-gray-800 bg-black opacity-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className={cn(
                        "w-4 h-4 rounded-full border-2 transition-colors",
                        rule.enabled 
                          ? "border-[#00FF41] bg-[#00FF41]" 
                          : "border-gray-600"
                      )}
                    />
                    <div>
                      <div className="text-xs font-mono text-white">{rule.name}</div>
                      <div className="text-[9px] font-mono text-gray-500">
                        {rule.condition.describe()} • {rule.triggerCount} triggers
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-gray-600 hover:text-[#FF4545] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Alert History */}
        <div className="p-4 max-h-48 overflow-y-auto">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-gray-500 mb-3">
            Recent Triggers
          </h3>
          <div className="space-y-1">
            {history.length === 0 ? (
              <p className="text-xs text-gray-600 font-mono">No alerts triggered yet</p>
            ) : (
              history.slice().reverse().map((alert, i) => (
                <div 
                  key={`${alert.timestamp}-${i}`}
                  className="flex items-center justify-between py-1.5 border-b border-gray-800/50 text-[10px] font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-[#00FF41]">{alert.ruleName}</span>
                  </div>
                  <span className="text-gray-500">
                    ${alert.context.price.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default AlertsPanel;
