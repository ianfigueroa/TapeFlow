// Trade analytics - VWAP, momentum, volume stats, and algo signal detection

import { Trade, TradeWithAnalytics, OrderBook } from '../types';

interface VWAPState {
  numerator: number;   // Sum of (price * volume)
  denominator: number; // Sum of volume
}

interface AnalyticsState {
  vwap: VWAPState;
  totalBuyVolume: number;
  totalSellVolume: number;
  prices: number[];     // Recent prices for momentum
  highPrice: number;
  lowPrice: number;
  momentum: number[];   // Recent momentum values
}

// Cache outside React - updated on every trade without re-renders
const analyticsCache = new Map<string, AnalyticsState>();

/**
 * Get or create analytics state for a symbol
 */
function getState(symbol: string): AnalyticsState {
  if (!analyticsCache.has(symbol)) {
    analyticsCache.set(symbol, {
      vwap: { numerator: 0, denominator: 0 },
      totalBuyVolume: 0,
      totalSellVolume: 0,
      prices: [],
      highPrice: 0,
      lowPrice: Infinity,
      momentum: [],
    });
  }
  return analyticsCache.get(symbol)!;
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 * 
 * VWAP = Sum(Price * Volume) / Sum(Volume)
 * 
 * This is a running calculation - each trade updates the cumulative totals.
 * Traders use VWAP to see if they're getting good fills relative to the
 * day's average price.
 */
export function calculateVWAP(symbol: string, price: number, volume: number): number {
  const state = getState(symbol);
  
  state.vwap.numerator += price * volume;
  state.vwap.denominator += volume;
  
  if (state.vwap.denominator === 0) return price;
  return state.vwap.numerator / state.vwap.denominator;
}

/**
 * Get current VWAP without updating
 */
export function getCurrentVWAP(symbol: string): number {
  const state = analyticsCache.get(symbol);
  if (!state || state.vwap.denominator === 0) return 0;
  return state.vwap.numerator / state.vwap.denominator;
}

/**
 * Calculate VWAP drift (how far current price is from VWAP)
 * 
 * Positive = trading above VWAP (bullish)
 * Negative = trading below VWAP (bearish)
 */
export function calculateVWAPDrift(currentPrice: number, vwap: number): number {
  if (vwap === 0) return 0;
  return ((currentPrice - vwap) / vwap) * 100;
}

/**
 * Calculate cumulative delta (buy volume - sell volume)
 * 
 * This is one of the most important order flow metrics. Positive delta means
 * more aggressive buying, negative means more aggressive selling.
 */
export function calculateDelta(symbol: string, side: string, volume: number): number {
  const state = getState(symbol);
  
  if (side === 'buy') {
    state.totalBuyVolume += volume;
  } else if (side === 'sell') {
    state.totalSellVolume += volume;
  }
  
  return state.totalBuyVolume - state.totalSellVolume;
}

/**
 * Get cumulative delta without updating
 */
export function getCumulativeDelta(symbol: string): number {
  const state = analyticsCache.get(symbol);
  if (!state) return 0;
  return state.totalBuyVolume - state.totalSellVolume;
}

/**
 * Calculate relative strength (buy volume as % of total)
 * 
 * 50% = balanced
 * >50% = more buying pressure
 * <50% = more selling pressure
 */
export function calculateRelativeStrength(symbol: string): number {
  const state = analyticsCache.get(symbol);
  if (!state) return 50;
  
  const total = state.totalBuyVolume + state.totalSellVolume;
  if (total === 0) return 50;
  
  return (state.totalBuyVolume / total) * 100;
}

/**
 * Calculate momentum from recent price changes
 * 
 * Uses a 20-trade window to smooth out noise. Positive = trending up.
 */
export function calculateMomentum(symbol: string, price: number): number {
  const state = getState(symbol);
  
  state.prices.push(price);
  
  // Keep last 20 prices
  if (state.prices.length > 20) {
    state.prices.shift();
  }
  
  if (state.prices.length < 2) return 0;
  
  // Momentum = % change from oldest to newest
  const oldPrice = state.prices[0];
  const momentum = ((price - oldPrice) / oldPrice) * 100;
  
  // Keep momentum history for averaging
  state.momentum.push(momentum);
  if (state.momentum.length > 10) {
    state.momentum.shift();
  }
  
  // Return average momentum
  return state.momentum.reduce((a, b) => a + b, 0) / state.momentum.length;
}

/**
 * Update high/low tracking
 */
export function updateHighLow(symbol: string, price: number): { high: number; low: number } {
  const state = getState(symbol);
  
  if (price > state.highPrice) {
    state.highPrice = price;
  }
  if (price < state.lowPrice) {
    state.lowPrice = price;
  }
  
  return { high: state.highPrice, low: state.lowPrice };
}

/**
 * Get high/low prices for the session
 */
export function getHighLow(symbol: string): { high: number; low: number } {
  const state = analyticsCache.get(symbol);
  if (!state) return { high: 0, low: 0 };
  return { high: state.highPrice, low: state.lowPrice === Infinity ? 0 : state.lowPrice };
}

/**
 * Get spread at the moment a trade printed
 * 
 * Useful for seeing market conditions when a large order hit.
 * Tight spread = liquid market, wide spread = less liquid.
 */
export function getSpreadAtPrint(orderBook: OrderBook | null): number {
  if (!orderBook) return 0;
  return orderBook.spread;
}

/**
 * Enrich a raw trade with computed analytics
 * 
 * This is called on every incoming trade. We compute VWAP, delta, momentum,
 * etc. and attach them to the trade object for display.
 */
export function enrichTradeWithAnalytics(
  trade: Trade,
  orderBook: OrderBook | null
): TradeWithAnalytics {
  const { symbol, price, volume, side } = trade;
  
  const vwap = calculateVWAP(symbol, price, volume);
  const vwapDrift = calculateVWAPDrift(price, vwap);
  const delta = calculateDelta(symbol, side, volume);
  const relativeStrength = calculateRelativeStrength(symbol);
  const momentum = calculateMomentum(symbol, price);
  const spreadAtPrint = getSpreadAtPrint(orderBook);
  
  updateHighLow(symbol, price);
  
  return {
    ...trade,
    vwap,
    vwapDrift,
    delta,
    relativeStrength,
    momentum,
    spreadAtPrint,
  };
}

/**
 * Reset analytics for a symbol (on unsubscribe)
 */
export function resetAnalytics(symbol: string): void {
  analyticsCache.delete(symbol);
}

/**
 * Reset everything (on reconnect or full refresh)
 */
export function resetAllAnalytics(): void {
  analyticsCache.clear();
}

/**
 * Calculate order book imbalance
 * 
 * Compares total bid volume to ask volume in the visible book.
 * Positive = more bids (support), Negative = more asks (resistance).
 */
export function calculateOrderBookImbalance(orderBook: OrderBook): number {
  if (!orderBook) return 0;
  
  const bidVolume = orderBook.bids.reduce((sum, level) => sum + level.size, 0);
  const askVolume = orderBook.asks.reduce((sum, level) => sum + level.size, 0);
  const total = bidVolume + askVolume;
  
  if (total === 0) return 0;
  return ((bidVolume - askVolume) / total) * 100;
}

/**
 * Calculate dollar liquidity at N levels
 * 
 * Shows how much money is resting in the book. More liquidity generally
 * means tighter spreads and less slippage for large orders.
 */
export function calculateLiquidityAtLevel(orderBook: OrderBook, levels: number = 5): {
  bidLiquidity: number;
  askLiquidity: number;
  totalLiquidity: number;
} {
  const bidLiquidity = orderBook.bids
    .slice(0, levels)
    .reduce((sum, level) => sum + level.size * level.price, 0);
  
  const askLiquidity = orderBook.asks
    .slice(0, levels)
    .reduce((sum, level) => sum + level.size * level.price, 0);
  
  return {
    bidLiquidity,
    askLiquidity,
    totalLiquidity: bidLiquidity + askLiquidity,
  };
}

/**
 * Get mid price (simple average of best bid and ask)
 */
export function getMidPrice(orderBook: OrderBook | null): number {
  if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) return 0;
  return (orderBook.bids[0].price + orderBook.asks[0].price) / 2;
}

/**
 * Get weighted mid price
 * 
 * Weights the mid price by the size at each level. If there's more size
 * on the bid, the weighted mid shifts closer to the bid price.
 */
export function getWeightedMidPrice(orderBook: OrderBook | null): number {
  if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) return 0;
  
  const bestBid = orderBook.bids[0];
  const bestAsk = orderBook.asks[0];
  
  const totalSize = bestBid.size + bestAsk.size;
  if (totalSize === 0) return (bestBid.price + bestAsk.price) / 2;
  
  // Cross-weighted: bid price weighted by ask size, ask price weighted by bid size
  return (bestBid.price * bestAsk.size + bestAsk.price * bestBid.size) / totalSize;
}
