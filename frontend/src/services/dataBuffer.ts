// Data buffer - decouples WebSocket from React (500+ trades/sec -> 60fps render)

import type { Trade, OrderBook, Ticker, TradeWithAnalytics } from '../types';

const MAX_BUFFER = 5000;  // Store 5000 trades for chart history
const MAX_VISIBLE = 100;  // Display limit for Time & Sales
const MAX_CHART_TRADES = 2000;  // Trades available for chart candle building

// Trade rate tracking - Sliding Window OPS Counter
// Stores individual trade timestamps and calculates OPS on-demand by filtering
// timestamps within the last 1000ms. This provides accurate real-time OPS values.
interface RateTracker {
  timestamps: number[];  // Raw trade timestamps (kept for 10s for averaging)
  history: number[];     // Rolling history of OPS samples for averaging
  lastSampleTime: number; // Last time we took an OPS sample
}

const SLIDING_WINDOW_MS = 1000;    // 1 second window for current OPS
const MAX_TIMESTAMP_AGE_MS = 10000; // Keep 10 seconds of timestamps for averaging
const MAX_HISTORY_SAMPLES = 10;     // Keep 10 OPS samples for moving average

const rateTrackers = new Map<string, RateTracker>();

function getRateTracker(symbol: string): RateTracker {
  const key = symbol.toUpperCase();
  let t = rateTrackers.get(key);
  if (!t) {
    t = { timestamps: [], history: [], lastSampleTime: Date.now() };
    rateTrackers.set(key, t);
  }
  return t;
}

function recordTradeRate(symbol: string): void {
  const t = getRateTracker(symbol);
  const now = Date.now();
  t.timestamps.push(now);
  
  // Prune old timestamps to prevent memory growth
  // Keep only timestamps within MAX_TIMESTAMP_AGE_MS
  const cutoff = now - MAX_TIMESTAMP_AGE_MS;
  while (t.timestamps.length > 0 && t.timestamps[0] < cutoff) {
    t.timestamps.shift();
  }
}

/**
 * Get real-time OPS using sliding window
 * Counts trades in the last SLIDING_WINDOW_MS milliseconds
 */
function getCurrentOPS(symbol: string): number {
  const t = getRateTracker(symbol);
  const now = Date.now();
  const windowStart = now - SLIDING_WINDOW_MS;
  
  // Count timestamps within the sliding window
  // Binary search would be faster for large arrays, but linear is fine for typical trade rates
  let count = 0;
  for (let i = t.timestamps.length - 1; i >= 0; i--) {
    if (t.timestamps[i] >= windowStart) {
      count++;
    } else {
      break; // Timestamps are ordered, so we can stop early
    }
  }
  return count;
}

/**
 * Update the rolling average (called periodically, not on every trade)
 */
function updateRollingAverage(symbol: string): void {
  const t = getRateTracker(symbol);
  const currentOPS = getCurrentOPS(symbol);
  
  t.history.push(currentOPS);
  if (t.history.length > MAX_HISTORY_SAMPLES) {
    t.history.shift();
  }
  t.lastSampleTime = Date.now();
}

// Update rolling averages every 500ms (more frequent than before for smoother display)
setInterval(() => {
  for (const sym of rateTrackers.keys()) {
    updateRollingAverage(sym);
  }
}, 500);

/**
 * Get trade rate statistics with real-time sliding window OPS
 */
export function getTradeRate(symbol: string) {
  const t = getRateTracker(symbol);
  const current = getCurrentOPS(symbol); // Real-time sliding window count
  const avg = t.history.length > 0 
    ? t.history.reduce((a, b) => a + b, 0) / t.history.length 
    : current;
  
  return { 
    current,  // Exact count of trades in last 1000ms
    avg,      // Moving average over last 10 samples
    history: [...t.history] 
  };
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

// Get more trades for chart candle building (larger buffer than display)
export function getChartTrades(symbol: string): TradeWithAnalytics[] {
  return getTradeBuffer(symbol).processed.slice(0, MAX_CHART_TRADES);
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
