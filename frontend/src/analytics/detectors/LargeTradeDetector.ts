/**
 * LargeTradeDetector - Market Pulse / Block Trade Detection
 * 
 * Detects significant market events that quants monitor:
 * - Block trades: Large individual trades above threshold
 * - Sweep orders: Aggressive orders crossing multiple price levels
 * - Momentum shifts: Rapid CVD changes indicating institutional activity
 * - Absorption: Large volume at single price without price movement
 * 
 * Design:
 * - Configurable thresholds by symbol (BTC higher than alts)
 * - Callback pattern for real-time alerts
 * - History buffer for recent signals
 * - Volume normalization for cross-asset comparison
 */

import type { Trade } from '../../types';

export type LargeTradeSignalType = 
  | 'block'       // Single large trade
  | 'sweep'       // Aggressive order crossing levels
  | 'momentum'    // Rapid CVD shift
  | 'absorption'; // Volume absorbed without price move

export interface LargeTradeSignal {
  id: string;
  type: LargeTradeSignalType;
  symbol: string;
  timestamp: number;
  
  // Trade details
  price: number;
  volume: number;
  notional: number;    // USD value
  side: 'buy' | 'sell';
  
  // Signal-specific data
  levelsSwept?: number;        // For sweep signals
  priceImpact?: number;        // Percentage price move
  cvdChange?: number;          // For momentum signals
  absorptionRatio?: number;    // Volume / price move ratio
  
  // Severity
  severity: 'low' | 'medium' | 'high' | 'extreme';
  message: string;
}

export interface LargeTradeConfig {
  // Block trade thresholds (USD notional)
  blockThresholds: {
    low: number;      // Low severity
    medium: number;   // Medium severity
    high: number;     // High severity
    extreme: number;  // Extreme severity
  };
  
  // Sweep detection
  sweepMinLevels: number;      // Minimum levels crossed to qualify
  sweepTimeWindowMs: number;   // Time window for sweep detection
  
  // Momentum detection
  momentumCvdThreshold: number;  // CVD change threshold
  momentumTimeWindowMs: number;  // Time window for CVD comparison
  
  // Absorption detection
  absorptionVolumeThreshold: number;  // Minimum volume
  absorptionPriceThreshold: number;   // Max price change %
  
  // History
  maxSignals: number;
}

const DEFAULT_CONFIG: LargeTradeConfig = {
  blockThresholds: {
    low: 50000,       // $50k
    medium: 100000,   // $100k
    high: 250000,     // $250k
    extreme: 1000000, // $1M
  },
  sweepMinLevels: 3,
  sweepTimeWindowMs: 1000,
  momentumCvdThreshold: 10000,
  momentumTimeWindowMs: 5000,
  absorptionVolumeThreshold: 50000,
  absorptionPriceThreshold: 0.05,
  maxSignals: 100,
};

// Symbol-specific multipliers
const SYMBOL_MULTIPLIERS: Record<string, number> = {
  'BTCUSDT': 5.0,    // BTC trades larger
  'ETHUSDT': 2.0,    // ETH medium
  'SOLUSDT': 0.5,    // SOL smaller
  'DOGEUSDT': 0.3,   // DOGE even smaller
};

interface RecentTrade {
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  timestamp: number;
  notional: number;
}

export class LargeTradeDetector {
  private config: LargeTradeConfig;
  private symbol: string;
  private multiplier: number;
  
  // Recent trades for sweep detection
  private recentTrades: RecentTrade[] = [];
  
  // CVD tracking for momentum
  private cvdHistory: Array<{ timestamp: number; cvd: number }> = [];
  private currentCvd: number = 0;
  
  // Price tracking for absorption
  private lastPrice: number = 0;
  private priceAtWindowStart: number = 0;
  private volumeInWindow: number = 0;
  private windowStartTime: number = 0;
  
  // Signal history
  private signals: LargeTradeSignal[] = [];
  private signalCallbacks: Set<(signal: LargeTradeSignal) => void> = new Set();
  
  private signalIdCounter: number = 0;

  constructor(symbol: string, config: Partial<LargeTradeConfig> = {}) {
    this.symbol = symbol.toUpperCase();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.multiplier = SYMBOL_MULTIPLIERS[this.symbol] || 1.0;
  }

  /**
   * Process a trade and check for signals
   */
  processTrade(trade: Trade): LargeTradeSignal[] {
    const now = Date.now();
    const notional = trade.price * trade.volume;
    const side = trade.side as 'buy' | 'sell';
    
    // Update CVD
    this.currentCvd += side === 'buy' ? trade.volume : -trade.volume;
    this.cvdHistory.push({ timestamp: now, cvd: this.currentCvd });
    this.pruneCvdHistory(now);
    
    // Update price tracking
    if (this.lastPrice === 0) {
      this.lastPrice = trade.price;
      this.priceAtWindowStart = trade.price;
      this.windowStartTime = now;
    }
    
    // Store recent trade
    const recentTrade: RecentTrade = {
      price: trade.price,
      volume: trade.volume,
      side,
      timestamp: now,
      notional,
    };
    this.recentTrades.push(recentTrade);
    this.pruneRecentTrades(now);
    
    // Collect signals
    const newSignals: LargeTradeSignal[] = [];
    
    // Check for block trade
    const blockSignal = this.checkBlockTrade(trade, notional, side);
    if (blockSignal) newSignals.push(blockSignal);
    
    // Check for sweep
    const sweepSignal = this.checkSweep(side, now);
    if (sweepSignal) newSignals.push(sweepSignal);
    
    // Check for momentum
    const momentumSignal = this.checkMomentum(now);
    if (momentumSignal) newSignals.push(momentumSignal);
    
    // Check for absorption
    const absorptionSignal = this.checkAbsorption(trade, now);
    if (absorptionSignal) newSignals.push(absorptionSignal);
    
    // Update last price
    this.lastPrice = trade.price;
    
    // Store and emit signals
    for (const signal of newSignals) {
      this.signals.push(signal);
      if (this.signals.length > this.config.maxSignals) {
        this.signals.shift();
      }
      for (const callback of this.signalCallbacks) {
        callback(signal);
      }
    }
    
    return newSignals;
  }

  /**
   * Check for block trade (single large trade)
   */
  private checkBlockTrade(trade: Trade, notional: number, side: 'buy' | 'sell'): LargeTradeSignal | null {
    const thresholds = this.config.blockThresholds;
    const adjustedNotional = notional / this.multiplier;
    
    let severity: 'low' | 'medium' | 'high' | 'extreme' | null = null;
    
    if (adjustedNotional >= thresholds.extreme * this.multiplier) {
      severity = 'extreme';
    } else if (adjustedNotional >= thresholds.high * this.multiplier) {
      severity = 'high';
    } else if (adjustedNotional >= thresholds.medium * this.multiplier) {
      severity = 'medium';
    } else if (adjustedNotional >= thresholds.low * this.multiplier) {
      severity = 'low';
    }
    
    if (!severity) return null;
    
    const formattedNotional = this.formatNotional(notional);
    
    return {
      id: this.generateId(),
      type: 'block',
      symbol: this.symbol,
      timestamp: Date.now(),
      price: trade.price,
      volume: trade.volume,
      notional,
      side,
      severity,
      message: `${severity.toUpperCase()} ${side.toUpperCase()} ${formattedNotional} @ ${trade.price.toFixed(2)}`,
    };
  }

  /**
   * Check for sweep order (multiple levels hit quickly)
   */
  private checkSweep(currentSide: 'buy' | 'sell', now: number): LargeTradeSignal | null {
    // Filter trades in sweep window with same side
    const windowTrades = this.recentTrades.filter(
      t => t.timestamp > now - this.config.sweepTimeWindowMs && t.side === currentSide
    );
    
    if (windowTrades.length < 2) return null;
    
    // Count unique price levels
    const uniqueLevels = new Set(windowTrades.map(t => t.price));
    const levelsSwept = uniqueLevels.size;
    
    if (levelsSwept < this.config.sweepMinLevels) return null;
    
    // Calculate aggregate volume and price impact
    const totalVolume = windowTrades.reduce((sum, t) => sum + t.volume, 0);
    const totalNotional = windowTrades.reduce((sum, t) => sum + t.notional, 0);
    const prices = windowTrades.map(t => t.price);
    const priceRange = Math.max(...prices) - Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const priceImpact = (priceRange / avgPrice) * 100;
    
    // Determine severity based on levels and volume
    let severity: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (levelsSwept >= 10 || totalNotional >= this.config.blockThresholds.high * this.multiplier) {
      severity = 'extreme';
    } else if (levelsSwept >= 7 || totalNotional >= this.config.blockThresholds.medium * this.multiplier) {
      severity = 'high';
    } else if (levelsSwept >= 5) {
      severity = 'medium';
    }
    
    // Only report significant sweeps
    if (severity === 'low' && levelsSwept < 5) return null;
    
    const formattedNotional = this.formatNotional(totalNotional);
    
    // Clear recent trades to avoid duplicate signals
    this.recentTrades = this.recentTrades.filter(
      t => t.timestamp <= now - this.config.sweepTimeWindowMs || t.side !== currentSide
    );
    
    return {
      id: this.generateId(),
      type: 'sweep',
      symbol: this.symbol,
      timestamp: now,
      price: avgPrice,
      volume: totalVolume,
      notional: totalNotional,
      side: currentSide,
      levelsSwept,
      priceImpact,
      severity,
      message: `SWEEP ${currentSide.toUpperCase()} ${formattedNotional} across ${levelsSwept} levels (${priceImpact.toFixed(2)}% impact)`,
    };
  }

  /**
   * Check for momentum shift (rapid CVD change)
   */
  private checkMomentum(now: number): LargeTradeSignal | null {
    if (this.cvdHistory.length < 2) return null;
    
    const windowStart = now - this.config.momentumTimeWindowMs;
    const oldCvd = this.cvdHistory.find(h => h.timestamp >= windowStart);
    
    if (!oldCvd) return null;
    
    const cvdChange = this.currentCvd - oldCvd.cvd;
    const adjustedThreshold = this.config.momentumCvdThreshold * this.multiplier;
    
    if (Math.abs(cvdChange) < adjustedThreshold) return null;
    
    const side: 'buy' | 'sell' = cvdChange > 0 ? 'buy' : 'sell';
    
    let severity: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
    if (Math.abs(cvdChange) >= adjustedThreshold * 4) {
      severity = 'extreme';
    } else if (Math.abs(cvdChange) >= adjustedThreshold * 2) {
      severity = 'high';
    }
    
    // Reset tracking to avoid duplicate signals
    this.cvdHistory = this.cvdHistory.filter(h => h.timestamp > now - 1000);
    
    return {
      id: this.generateId(),
      type: 'momentum',
      symbol: this.symbol,
      timestamp: now,
      price: this.lastPrice,
      volume: Math.abs(cvdChange),
      notional: Math.abs(cvdChange) * this.lastPrice,
      side,
      cvdChange,
      severity,
      message: `MOMENTUM ${side.toUpperCase()} CVD ${cvdChange > 0 ? '+' : ''}${this.formatVolume(cvdChange)} in ${this.config.momentumTimeWindowMs / 1000}s`,
    };
  }

  /**
   * Check for absorption (high volume, low price change)
   */
  private checkAbsorption(trade: Trade, now: number): LargeTradeSignal | null {
    // Reset window periodically
    if (now - this.windowStartTime > 5000) {
      this.priceAtWindowStart = this.lastPrice;
      this.volumeInWindow = 0;
      this.windowStartTime = now;
    }
    
    this.volumeInWindow += trade.volume;
    
    const priceChange = Math.abs(trade.price - this.priceAtWindowStart) / this.priceAtWindowStart * 100;
    const volumeNotional = this.volumeInWindow * trade.price;
    
    // High volume but low price change = absorption
    if (
      volumeNotional >= this.config.absorptionVolumeThreshold * this.multiplier &&
      priceChange <= this.config.absorptionPriceThreshold
    ) {
      const absorptionRatio = volumeNotional / (priceChange || 0.001);
      
      // Determine which side is absorbing
      const recentBuys = this.recentTrades.filter(t => t.side === 'buy').length;
      const recentSells = this.recentTrades.filter(t => t.side === 'sell').length;
      const absorbingSide: 'buy' | 'sell' = recentBuys > recentSells ? 'sell' : 'buy';
      
      // Reset window
      this.priceAtWindowStart = trade.price;
      this.volumeInWindow = 0;
      this.windowStartTime = now;
      
      return {
        id: this.generateId(),
        type: 'absorption',
        symbol: this.symbol,
        timestamp: now,
        price: trade.price,
        volume: this.volumeInWindow,
        notional: volumeNotional,
        side: absorbingSide,
        absorptionRatio,
        priceImpact: priceChange,
        severity: 'medium',
        message: `ABSORPTION ${this.formatNotional(volumeNotional)} absorbed with only ${priceChange.toFixed(3)}% move`,
      };
    }
    
    return null;
  }

  /**
   * Prune old CVD history
   */
  private pruneCvdHistory(now: number): void {
    const cutoff = now - this.config.momentumTimeWindowMs - 1000;
    this.cvdHistory = this.cvdHistory.filter(h => h.timestamp > cutoff);
  }

  /**
   * Prune old recent trades
   */
  private pruneRecentTrades(now: number): void {
    const cutoff = now - this.config.sweepTimeWindowMs - 1000;
    this.recentTrades = this.recentTrades.filter(t => t.timestamp > cutoff);
  }

  /**
   * Format notional value for display
   */
  private formatNotional(value: number): string {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }

  /**
   * Format volume for display
   */
  private formatVolume(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(2)}k`;
    return value.toFixed(4);
  }

  /**
   * Generate unique signal ID
   */
  private generateId(): string {
    return `${this.symbol}-${Date.now()}-${++this.signalIdCounter}`;
  }

  /**
   * Subscribe to signals
   */
  onSignal(callback: (signal: LargeTradeSignal) => void): () => void {
    this.signalCallbacks.add(callback);
    return () => this.signalCallbacks.delete(callback);
  }

  /**
   * Get recent signals
   */
  getRecentSignals(limit: number = 20): LargeTradeSignal[] {
    return this.signals.slice(-limit);
  }

  /**
   * Get signals by type
   */
  getSignalsByType(type: LargeTradeSignalType): LargeTradeSignal[] {
    return this.signals.filter(s => s.type === type);
  }

  /**
   * Get current CVD
   */
  getCurrentCvd(): number {
    return this.currentCvd;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.recentTrades = [];
    this.cvdHistory = [];
    this.currentCvd = 0;
    this.lastPrice = 0;
    this.priceAtWindowStart = 0;
    this.volumeInWindow = 0;
    this.windowStartTime = 0;
    this.signals = [];
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<LargeTradeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set symbol multiplier
   */
  setMultiplier(multiplier: number): void {
    this.multiplier = multiplier;
  }
}
