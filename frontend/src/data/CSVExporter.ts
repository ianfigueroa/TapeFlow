import type { TradeWithAnalytics } from '../types';
import type { TriggeredAlert } from '../alerts/types';
import type { RecordedSession } from './types';

function escapeCSV(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

export function exportTradesToCSV(trades: TradeWithAnalytics[]): string {
  const headers = [
    'timestamp',
    'symbol',
    'price',
    'volume',
    'value',
    'side',
    'vwap',
    'vwap_drift',
    'delta',
    'relative_strength',
    'spread_at_print',
    'is_liquidation',
    'liquidation_side',
  ];

  const rows = trades.map((t) => [
    formatTimestamp(t.timestamp),
    escapeCSV(t.symbol),
    t.price.toFixed(8),
    t.volume.toFixed(8),
    (t.price * t.volume).toFixed(2),
    t.side,
    t.vwap?.toFixed(8) || '',
    t.vwapDrift?.toFixed(4) || '',
    t.delta?.toFixed(2) || '',
    t.relativeStrength?.toFixed(2) || '',
    t.spreadAtPrint?.toFixed(8) || '',
    t.isLiquidation ? 'true' : 'false',
    t.liquidationSide || '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function exportAlertsToCSV(alerts: TriggeredAlert[]): string {
  const headers = [
    'timestamp',
    'rule_id',
    'rule_name',
    'message',
    'price',
    'vwap',
    'obi',
    'cvd',
    'ops',
    'spread',
  ];

  const rows = alerts.map((a) => [
    formatTimestamp(a.timestamp),
    escapeCSV(a.ruleId),
    escapeCSV(a.ruleName),
    escapeCSV(a.message),
    a.context.price.toFixed(8),
    a.context.vwap.toFixed(8),
    a.context.obi.toFixed(4),
    a.context.cvd.toFixed(2),
    a.context.ops.toString(),
    a.context.spread.toFixed(8),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function exportSessionToCSV(session: RecordedSession): string {
  const headers = [
    'timestamp',
    'type',
    'symbol',
    'price',
    'volume',
    'side',
    'best_bid',
    'best_ask',
    'spread',
  ];

  const rows: string[][] = [];

  for (const trade of session.trades) {
    rows.push([
      formatTimestamp(trade.timestamp),
      'trade',
      trade.symbol,
      trade.price.toFixed(8),
      trade.volume.toFixed(8),
      trade.side,
      '',
      '',
      '',
    ]);
  }

  for (const snap of session.orderBookSnapshots) {
    const ob = snap.orderBook;
    const bestBid = ob.bids[0]?.price || 0;
    const bestAsk = ob.asks[0]?.price || 0;
    rows.push([
      formatTimestamp(snap.timestamp),
      'orderbook',
      ob.symbol,
      '',
      '',
      '',
      bestBid.toFixed(8),
      bestAsk.toFixed(8),
      ob.spread.toFixed(8),
    ]);
  }

  rows.sort((a, b) => a[0].localeCompare(b[0]));

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function generateFilename(prefix: string, symbol: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${prefix}_${symbol}_${dateStr}_${timeStr}.csv`;
}
