export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'partial';

export interface PaperOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  filledQuantity: number;
  filledPrice: number;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
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
}

export interface AccountState {
  balance: number;
  initialBalance: number;
  totalPnL: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
}
