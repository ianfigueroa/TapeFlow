/**
 * Sentiment analysis types for TapeFlow
 * Provides bullish/bearish market sentiment based on order flow metrics
 */

export type SentimentBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type SentimentSource = 
  | 'cvd'           // Cumulative Volume Delta trend
  | 'obi'           // Order Book Imbalance
  | 'pressure'      // Buy/sell pressure (relative strength)
  | 'vwap'          // VWAP drift direction
  | 'momentum'      // Price momentum
  | 'composite';    // Combined score

export interface SentimentIndicator {
  source: SentimentSource;
  value: number;        // -100 to 100 scale
  weight: number;       // Weight in composite calculation
  description: string;  // Human readable explanation
}

export interface SentimentSignal {
  id: string;
  symbol: string;
  timestamp: number;
  
  // Overall sentiment
  bias: SentimentBias;
  score: number;           // -100 (max bearish) to +100 (max bullish)
  confidence: number;      // 0-100 percentage
  
  // Contributing factors
  indicators: SentimentIndicator[];
  
  // Trend info
  previousScore: number;
  scoreChange: number;     // Change from previous reading
  trend: 'improving' | 'declining' | 'stable';
}

export interface SentimentHistory {
  timestamp: number;
  score: number;
  bias: SentimentBias;
}

export interface SentimentConfig {
  // Update frequency in milliseconds
  updateIntervalMs: number;
  
  // History buffer size (for sparkline)
  historySize: number;
  
  // Thresholds for bias classification
  bullishThreshold: number;   // Score above this = BULLISH
  bearishThreshold: number;   // Score below this = BEARISH
  
  // Indicator weights (must sum to 1.0)
  weights: {
    cvd: number;
    obi: number;
    pressure: number;
    vwap: number;
    momentum: number;
  };
  
  // Confidence calculation
  minConfidenceVolume: number;  // Minimum volume for high confidence
}

export const DEFAULT_SENTIMENT_CONFIG: SentimentConfig = {
  updateIntervalMs: 2000,
  historySize: 150,  // 5 minutes at 2s intervals
  bullishThreshold: 20,
  bearishThreshold: -20,
  weights: {
    cvd: 0.30,      // CVD is primary indicator
    obi: 0.25,      // Order book imbalance
    pressure: 0.20, // Buy/sell pressure
    vwap: 0.15,     // VWAP position
    momentum: 0.10, // Price momentum
  },
  minConfidenceVolume: 100,
};
