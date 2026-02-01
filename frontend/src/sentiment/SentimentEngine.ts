/**
 * SentimentEngine - Real-time market sentiment analysis
 * 
 * Consumes analytics data (CVD, OBI, VWAP, relative strength) to calculate
 * a composite sentiment score from -100 (max bearish) to +100 (max bullish).
 * 
 * Design principles:
 * - React-independent (can run in worker)
 * - Uses circular buffer for history (memory efficient)
 * - Exponential smoothing for noise reduction
 * - Configurable weights and thresholds
 */

import type { AnalyticsSnapshot } from '../analytics/AnalyticsEngine';
import { CircularBuffer } from '../analytics/buffers/CircularBuffer';
import type {
  SentimentSignal,
  SentimentIndicator,
  SentimentBias,
  SentimentHistory,
  SentimentConfig,
} from './types';
import { DEFAULT_SENTIMENT_CONFIG } from './types';

// Exponential moving average smoothing factor (0-1, higher = more responsive)
const EMA_ALPHA = 0.3;

export class SentimentEngine {
  readonly symbol: string;
  
  private config: SentimentConfig;
  private history: CircularBuffer<SentimentHistory>;
  
  // Smoothed values for noise reduction
  private smoothedCvd: number = 0;
  private smoothedObi: number = 0;
  private smoothedPressure: number = 50;
  private smoothedVwapDrift: number = 0;
  
  // Momentum tracking
  private priceHistory: number[] = [];
  private readonly MOMENTUM_WINDOW = 20;
  
  // Previous state for trend detection
  private previousScore: number = 0;
  private lastUpdate: number = 0;

  constructor(symbol: string, config: Partial<SentimentConfig> = {}) {
    this.symbol = symbol.toUpperCase();
    this.config = { ...DEFAULT_SENTIMENT_CONFIG, ...config };
    this.history = new CircularBuffer<SentimentHistory>(this.config.historySize);
  }

  /**
   * Process analytics snapshot and generate sentiment signal
   */
  process(analytics: AnalyticsSnapshot, currentPrice: number): SentimentSignal {
    const now = Date.now();
    
    // Update smoothed values with exponential moving average
    this.updateSmoothedValues(analytics, currentPrice);
    
    // Calculate individual indicator scores
    const indicators = this.calculateIndicators(analytics);
    
    // Calculate composite score
    const score = this.calculateCompositeScore(indicators);
    
    // Determine bias
    const bias = this.determineBias(score);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(analytics);
    
    // Determine trend
    const scoreChange = score - this.previousScore;
    const trend = this.determineTrend(scoreChange);
    
    // Create signal
    const signal: SentimentSignal = {
      id: `${this.symbol}-${now}`,
      symbol: this.symbol,
      timestamp: now,
      bias,
      score: Math.round(score * 10) / 10,
      confidence: Math.round(confidence),
      indicators,
      previousScore: this.previousScore,
      scoreChange: Math.round(scoreChange * 10) / 10,
      trend,
    };
    
    // Update history
    this.history.push({
      timestamp: now,
      score: signal.score,
      bias: signal.bias,
    });
    
    // Store for next iteration
    this.previousScore = score;
    this.lastUpdate = now;
    
    return signal;
  }

  /**
   * Update exponentially smoothed indicator values
   */
  private updateSmoothedValues(analytics: AnalyticsSnapshot, currentPrice: number): void {
    // CVD: normalize to -100 to 100 based on session delta magnitude
    // Use relative strength as proxy since raw CVD varies widely
    const cvdNormalized = (analytics.relativeStrength - 50) * 2;
    this.smoothedCvd = this.ema(this.smoothedCvd, cvdNormalized);
    
    // OBI: already -1 to 1, scale to -100 to 100
    this.smoothedObi = this.ema(this.smoothedObi, analytics.obiPercent);
    
    // Pressure: relative strength is 0-100, center it
    this.smoothedPressure = this.ema(this.smoothedPressure, analytics.relativeStrength);
    
    // VWAP drift: percentage from VWAP, clamp to reasonable range
    const vwapClamped = Math.max(-5, Math.min(5, analytics.vwapDrift));
    this.smoothedVwapDrift = this.ema(this.smoothedVwapDrift, vwapClamped * 20);
    
    // Update price history for momentum
    this.priceHistory.push(currentPrice);
    if (this.priceHistory.length > this.MOMENTUM_WINDOW) {
      this.priceHistory.shift();
    }
  }

  /**
   * Calculate individual indicator scores
   */
  private calculateIndicators(_analytics: AnalyticsSnapshot): SentimentIndicator[] {
    const indicators: SentimentIndicator[] = [];
    const weights = this.config.weights;
    
    // CVD Indicator
    indicators.push({
      source: 'cvd',
      value: Math.round(this.smoothedCvd),
      weight: weights.cvd,
      description: this.describeCvd(this.smoothedCvd),
    });
    
    // OBI Indicator
    indicators.push({
      source: 'obi',
      value: Math.round(this.smoothedObi),
      weight: weights.obi,
      description: this.describeObi(this.smoothedObi),
    });
    
    // Buy/Sell Pressure
    const pressureScore = (this.smoothedPressure - 50) * 2;
    indicators.push({
      source: 'pressure',
      value: Math.round(pressureScore),
      weight: weights.pressure,
      description: this.describePressure(pressureScore),
    });
    
    // VWAP Position
    indicators.push({
      source: 'vwap',
      value: Math.round(this.smoothedVwapDrift),
      weight: weights.vwap,
      description: this.describeVwap(this.smoothedVwapDrift),
    });
    
    // Momentum
    const momentum = this.calculateMomentum();
    indicators.push({
      source: 'momentum',
      value: Math.round(momentum),
      weight: weights.momentum,
      description: this.describeMomentum(momentum),
    });
    
    return indicators;
  }

  /**
   * Calculate composite sentiment score from weighted indicators
   */
  private calculateCompositeScore(indicators: SentimentIndicator[]): number {
    let score = 0;
    for (const indicator of indicators) {
      score += indicator.value * indicator.weight;
    }
    // Clamp to -100 to 100
    return Math.max(-100, Math.min(100, score));
  }

  /**
   * Determine sentiment bias from score
   */
  private determineBias(score: number): SentimentBias {
    if (score >= this.config.bullishThreshold) return 'BULLISH';
    if (score <= this.config.bearishThreshold) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * Calculate confidence based on data quality and consistency
   */
  private calculateConfidence(analytics: AnalyticsSnapshot): number {
    let confidence = 50; // Base confidence
    
    // Higher OPS = more data = higher confidence
    if (analytics.ops > 50) confidence += 15;
    else if (analytics.ops > 10) confidence += 10;
    else if (analytics.ops < 2) confidence -= 20;
    
    // Indicator agreement increases confidence
    const indicators = this.calculateIndicators(analytics);
    const positiveCount = indicators.filter(i => i.value > 10).length;
    const negativeCount = indicators.filter(i => i.value < -10).length;
    
    // Strong agreement (4+ indicators same direction)
    if (positiveCount >= 4 || negativeCount >= 4) confidence += 20;
    else if (positiveCount >= 3 || negativeCount >= 3) confidence += 10;
    
    // Mixed signals reduce confidence
    if (positiveCount >= 2 && negativeCount >= 2) confidence -= 15;
    
    // Enough history for trend analysis
    if (this.history.length > 10) confidence += 5;
    
    return Math.max(10, Math.min(95, confidence));
  }

  /**
   * Determine score trend direction
   */
  private determineTrend(scoreChange: number): 'improving' | 'declining' | 'stable' {
    if (scoreChange > 3) return 'improving';
    if (scoreChange < -3) return 'declining';
    return 'stable';
  }

  /**
   * Calculate price momentum score
   */
  private calculateMomentum(): number {
    if (this.priceHistory.length < 2) return 0;
    
    const recent = this.priceHistory.slice(-5);
    const older = this.priceHistory.slice(0, 5);
    
    if (recent.length === 0 || older.length === 0) return 0;
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (olderAvg === 0) return 0;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    // Scale: 1% move = 50 points
    return Math.max(-100, Math.min(100, change * 50));
  }

  /**
   * Exponential moving average helper
   */
  private ema(previous: number, current: number): number {
    return EMA_ALPHA * current + (1 - EMA_ALPHA) * previous;
  }

  // Description generators for human-readable output
  private describeCvd(value: number): string {
    if (value > 50) return 'Strong buying pressure';
    if (value > 20) return 'Moderate buying pressure';
    if (value > -20) return 'Balanced flow';
    if (value > -50) return 'Moderate selling pressure';
    return 'Strong selling pressure';
  }

  private describeObi(value: number): string {
    if (value > 40) return 'Heavy bid stacking';
    if (value > 15) return 'Bid side dominant';
    if (value > -15) return 'Balanced book';
    if (value > -40) return 'Ask side dominant';
    return 'Heavy ask stacking';
  }

  private describePressure(value: number): string {
    if (value > 40) return 'Buyers in control';
    if (value > 15) return 'Slight buy pressure';
    if (value > -15) return 'Equilibrium';
    if (value > -40) return 'Slight sell pressure';
    return 'Sellers in control';
  }

  private describeVwap(value: number): string {
    if (value > 30) return 'Trading well above VWAP';
    if (value > 10) return 'Above VWAP';
    if (value > -10) return 'Near VWAP';
    if (value > -30) return 'Below VWAP';
    return 'Trading well below VWAP';
  }

  private describeMomentum(value: number): string {
    if (value > 40) return 'Strong upward momentum';
    if (value > 15) return 'Positive momentum';
    if (value > -15) return 'Flat momentum';
    if (value > -40) return 'Negative momentum';
    return 'Strong downward momentum';
  }

  /**
   * Get sentiment history for sparkline rendering
   */
  getHistory(): SentimentHistory[] {
    return this.history.toArray();
  }

  /**
   * Get latest signal without processing new data
   */
  getLatestSignal(): SentimentSignal | null {
    const latest = this.history.getLatest();
    if (!latest) return null;
    
    return {
      id: `${this.symbol}-${latest.timestamp}`,
      symbol: this.symbol,
      timestamp: latest.timestamp,
      bias: latest.bias,
      score: latest.score,
      confidence: 50,
      indicators: [],
      previousScore: this.previousScore,
      scoreChange: 0,
      trend: 'stable',
    };
  }

  /**
   * Check if engine needs update based on interval
   */
  needsUpdate(): boolean {
    return Date.now() - this.lastUpdate >= this.config.updateIntervalMs;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.smoothedCvd = 0;
    this.smoothedObi = 0;
    this.smoothedPressure = 50;
    this.smoothedVwapDrift = 0;
    this.priceHistory = [];
    this.previousScore = 0;
    this.lastUpdate = 0;
    this.history.clear();
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SentimentConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Resize history buffer if needed
    if (config.historySize && config.historySize !== this.history.capacity) {
      const oldHistory = this.history.toArray();
      this.history = new CircularBuffer<SentimentHistory>(config.historySize);
      for (const item of oldHistory.slice(-config.historySize)) {
        this.history.push(item);
      }
    }
  }

  /**
   * Get current config
   */
  getConfig(): SentimentConfig {
    return { ...this.config };
  }
}
