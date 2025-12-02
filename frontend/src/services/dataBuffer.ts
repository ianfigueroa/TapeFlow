// Data buffer - decouples WebSocket from React (500+ trades/sec -> 60fps render)

import type { Trade, OrderBook, Ticker, TradeWithAnalytics } from '../types';

const MAX_BUFFER = 1000;
const MAX_VISIBLE = 100;

// Trade rate tracking (single source of truth for all components)
interface RateTracker {
  timestamps: number[];
  current: number;
  avg: number;
  history: number[];
}

const rateTrackers = new Map<string, RateTracker>();

function getRateTracker(symbol: string): RateTracker {
  const key = symbol.toUpperCase();
  let t = rateTrackers.get(key);
  if (!t) {
    t = { timestamps: [], current: 0, avg: 0, history: [] };
    rateTrackers.set(key, t);
  }
  return t;
}

function recordTradeRate(symbol: string): void {
  getRateTracker(symbol).timestamps.push(Date.now());
}

function updateRates(symbol: string): void {
  const t = getRateTracker(symbol);
  const now = Date.now();
  t.timestamps = t.timestamps.filter(ts => ts > now - 10000);
  t.current = t.timestamps.filter(ts => ts > now - 1000).length;
  t.history.push(t.current);
  if (t.history.length > 10) t.history.shift();
  t.avg = t.history.length ? t.history.reduce((a, b) => a + b, 0) / t.history.length : 0;
}

setInterval(() => {
  for (const sym of rateTrackers.keys()) updateRates(sym);
}, 1000);

export function getTradeRate(symbol: string) {
  const t = getRateTracker(symbol);
  return { current: t.current, avg: t.avg, history: [...t.history] };
}

export function resetTradeRateTracker(symbol: string): void {
  rateTrackers.delete(symbol.toUpperCase());
}

// Latency tracking (uses min sample as clock offset)
interface LatencyTracker {
  samples: number[];
  offset: number | null;
}

const latencyTrackers = new Map<string, LatencyTracker>();

function getLatencyTracker(symbol: string): LatencyTracker {
  const key = symbol.toUpperCase();
  let t = latencyTrackers.get(key);
  if (!t) {
    t = { samples: [], offset: null };
    latencyTrackers.set(key, t);
  }
  return t;
}

export function recordTradeLatency(symbol: string, tradeTimestamp: number): void {
  const t = getLatencyTracker(symbol);
  const raw = Date.now() - tradeTimestamp;
  t.samples.push(raw);
  if (t.samples.length > 10) t.samples.shift();
  t.offset = Math.min(...t.samples);
}

export function getLatency(symbol: string): number | null {
  const t = getLatencyTracker(symbol);
  if (!t.samples.length || t.offset === null) return null;
  return Math.max(0, t.samples[t.samples.length - 1] - t.offset);
}

export function resetLatencyTracker(symbol: string): void {
  latencyTrackers.delete(symbol.toUpperCase());
}

// Trade listeners (observer pattern for AlgoSignals)
type TradeListener = (trade: Trade) => void;
const tradeListeners = new Set<TradeListener>();

export function subscribeToTrades(listener: TradeListener): () => void {
  tradeListeners.add(listener);
  return () => tradeListeners.delete(listener);
}

function notifyListeners(trade: Trade): void {
  for (const fn of tradeListeners) {
    try { fn(trade); } catch (e) { console.error('Listener error:', e); }
  }
}

// Trade buffer
interface TradeBuffer {
  incoming: Trade[];
  processed: TradeWithAnalytics[];
  hasNewData: boolean;
}

const tradeBuffers = new Map<string, TradeBuffer>();

function getTradeBuffer(symbol: string): TradeBuffer {
  const key = symbol.toUpperCase();
  let b = tradeBuffers.get(key);
  if (!b) {
    b = { incoming: [], processed: [], hasNewData: false };
    tradeBuffers.set(key, b);
  }
  return b;
}

export function pushTrade(trade: Trade): void {
  const b = getTradeBuffer(trade.symbol);
  b.incoming.push(trade);
  b.hasNewData = true;
  recordTradeLatency(trade.symbol, trade.timestamp);
  recordTradeRate(trade.symbol);
  notifyListeners(trade);
  if (b.incoming.length > MAX_BUFFER) b.incoming.shift();
}

export function pushTrades(trades: Trade[]): void {
  trades.forEach(pushTrade);
}

export function flushTradeBuffer(symbol: string) {
  const b = getTradeBuffer(symbol);
  if (!b.hasNewData) return { trades: [], hasNewData: false, pendingCount: 0 };
  const trades = b.incoming.slice();
  b.incoming = [];
  b.hasNewData = false;
  return { trades, hasNewData: true, pendingCount: trades.length };
}

export function getDisplayTrades(symbol: string): TradeWithAnalytics[] {
  return getTradeBuffer(symbol).processed.slice(0, MAX_VISIBLE);
}

export function setProcessedTrades(symbol: string, trades: TradeWithAnalytics[]): void {
  getTradeBuffer(symbol).processed = trades.slice(0, MAX_BUFFER);
}

// Order book buffer
interface OBBuffer {
  current: OrderBook | null;
  hasNewData: boolean;
}

const obBuffers = new Map<string, OBBuffer>();

function getOBBuffer(symbol: string): OBBuffer {
  const key = symbol.toUpperCase();
  let b = obBuffers.get(key);
  if (!b) {
    b = { current: null, hasNewData: false };
    obBuffers.set(key, b);
  }
  return b;
}

export function pushOrderBook(orderBook: OrderBook): void {
  const b = getOBBuffer(orderBook.symbol);
  b.current = orderBook;
  b.hasNewData = true;
}

export function flushOrderBookBuffer(symbol: string) {
  const b = getOBBuffer(symbol);
  if (!b.hasNewData) return { orderBook: null, hasNewData: false, updateCount: 0 };
  b.hasNewData = false;
  return { orderBook: b.current, hasNewData: true, updateCount: 1 };
}

export function getCurrentOrderBook(symbol: string): OrderBook | null {
  return getOBBuffer(symbol).current;
}

// Ticker buffer
interface TickerBuffer {
  current: Ticker | null;
  hasNewData: boolean;
}

const tickerBuffers = new Map<string, TickerBuffer>();

function getTickerBuffer(symbol: string): TickerBuffer {
  const key = symbol.toUpperCase();
  let b = tickerBuffers.get(key);
  if (!b) {
    b = { current: null, hasNewData: false };
    tickerBuffers.set(key, b);
  }
  return b;
}

export function pushTicker(ticker: Ticker): void {
  const b = getTickerBuffer(ticker.symbol);
  b.current = ticker;
  b.hasNewData = true;
}

export function flushTickerBuffer(symbol: string) {
  const b = getTickerBuffer(symbol);
  if (!b.hasNewData) return { ticker: b.current, hasNewData: false };
  b.hasNewData = false;
  return { ticker: b.current, hasNewData: true };
}

export function getCurrentTicker(symbol: string): Ticker | null {
  return getTickerBuffer(symbol).current;
}

// VWAP
const vwapValues = new Map<string, number>();

export function updateVwap(symbol: string, vwap: number): void {
  vwapValues.set(symbol.toUpperCase(), vwap);
}

export function getCurrentVwap(symbol: string): number {
  return vwapValues.get(symbol.toUpperCase()) || 0;
}

// Combined tape (all symbols)
const combinedTrades: TradeWithAnalytics[] = [];

export function pushToCombinedBuffer(trade: TradeWithAnalytics): void {
  combinedTrades.unshift(trade);
  if (combinedTrades.length > MAX_BUFFER) combinedTrades.pop();
}

export function getCombinedTrades(): TradeWithAnalytics[] {
  return combinedTrades.slice(0, MAX_VISIBLE);
}

export function flushCombinedBuffer() {
  return { trades: combinedTrades.slice(0, MAX_VISIBLE), hasNewData: combinedTrades.length > 0 };
}

// Cleanup
export function clearSymbolBuffer(symbol: string): void {
  const key = symbol.toUpperCase();
  tradeBuffers.delete(key);
  obBuffers.delete(key);
  tickerBuffers.delete(key);
  vwapValues.delete(key);
}

export function clearAllBuffers(): void {
  tradeBuffers.clear();
  obBuffers.clear();
  tickerBuffers.clear();
  vwapValues.clear();
  combinedTrades.length = 0;
}

export function getBufferStats() {
  return {
    tradeBuffers: tradeBuffers.size,
    orderBookBuffers: obBuffers.size,
    tickerBuffers: tickerBuffers.size,
    combinedTradesCount: combinedTrades.length,
  };
}
