export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit' | 'trailing-stop';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'partial' | 'triggered';

export interface PaperOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;           // Limit price
  stopPrice?: number;       // Stop trigger price
  trailingAmount?: number;  // Trailing stop distance (absolute or percentage based on trailingPercent)
  trailingPercent?: boolean; // If true, trailingAmount is a percentage
  filledQuantity: number;
  filledPrice: number;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
  // Bracket order fields (attached SL/TP)
  stopLoss?: number;        // Stop loss price
  takeProfit?: number;      // Take profit price
  parentOrderId?: string;   // For child orders in brackets
  childOrderIds?: string[]; // Child SL/TP order IDs
  // Execution details
  slippage?: number;        // Actual slippage incurred
  commission?: number;      // Commission charged
}

export interface Position {
  symbol: string;
  side: 'long' | 'short' | 'flat';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export interface TradeRecord {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  timestamp: number;
  pnl: number;
  slippage?: number;
  commission?: number;
}

export interface AccountState {
  balance: number;
  initialBalance: number;
  totalPnL: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
  totalCommission: number;
  totalSlippage: number;
}

// Engine configuration for slippage and commission simulation
export interface PaperTradingConfig {
  // Slippage settings
  slippageEnabled: boolean;
  slippagePercent: number;       // Base slippage as percentage (e.g., 0.05 = 0.05%)
  slippageBps: number;           // Slippage in basis points (e.g., 5 = 0.05%)
  slippageVolatility: number;    // Additional random slippage factor
  
  // Commission settings  
  commissionEnabled: boolean;
  commissionPercent: number;     // Commission as percentage (e.g., 0.1 = 0.1%)
  feeBps: number;                // Fee in basis points (e.g., 4 = 0.04%)
  commissionMin: number;         // Minimum commission per trade
  
  // Execution settings
  partialFillsEnabled: boolean;  // Allow partial fills on limit orders
  marketImpactEnabled: boolean;  // Simulate market impact on large orders
  
  // Risk controls
  riskEnabled: boolean;           // Enable risk limit checks
  maxPositionSize: number;        // Max position size in USD
  maxDailyLoss: number;           // Max daily loss limit in USD
  maxOpenPositions: number;       // Max number of concurrent positions
  maxOrderSize: number;           // Max single order size in USD
}

// Risk control check result
export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export const DEFAULT_PAPER_TRADING_CONFIG: PaperTradingConfig = {
  slippageEnabled: true,
  slippagePercent: 0.02,        // 0.02% base slippage
  slippageBps: 2,               // 2 bps
  slippageVolatility: 0.01,     // +/- 0.01% random
  
  commissionEnabled: true,
  commissionPercent: 0.075,     // 0.075% (similar to Binance maker)
  feeBps: 8,                    // 8 bps
  commissionMin: 0.01,          // $0.01 minimum
  
  partialFillsEnabled: false,
  marketImpactEnabled: false,
  
  // Risk controls - defaults
  riskEnabled: true,
  maxPositionSize: 100000,      // $100K max position
  maxDailyLoss: 5000,           // $5K daily loss limit
  maxOpenPositions: 5,          // 5 concurrent positions max
  maxOrderSize: 50000,          // $50K max single order
};
