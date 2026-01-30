import type {
  PaperOrder,
  Position,
  TradeRecord,
  AccountState,
  OrderSide,
  OrderType,
} from './types';

const INITIAL_BALANCE = 100000;

export class PaperTradingEngine {
  private orders: Map<string, PaperOrder> = new Map();
  private positions: Map<string, Position> = new Map();
  private trades: TradeRecord[] = [];
  private account: AccountState;
  private orderIdCounter: number = 0;
  private tradeIdCounter: number = 0;
  private listeners: Set<() => void> = new Set();

  constructor(initialBalance: number = INITIAL_BALANCE) {
    this.account = {
      balance: initialBalance,
      initialBalance,
      totalPnL: 0,
      winCount: 0,
      lossCount: 0,
      totalTrades: 0,
    };
  }

  placeOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: number,
    price?: number
  ): PaperOrder {
    const order: PaperOrder = {
      id: `order-${++this.orderIdCounter}`,
      symbol: symbol.toUpperCase(),
      side,
      type,
      quantity,
      price: type === 'limit' ? price : undefined,
      filledQuantity: 0,
      filledPrice: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.orders.set(order.id, order);
    this.notifyListeners();

    return order;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') return false;

    order.status = 'cancelled';
    this.notifyListeners();
    return true;
  }

  processMarketData(symbol: string, bestBid: number, bestAsk: number): void {
    const upperSymbol = symbol.toUpperCase();

    for (const order of this.orders.values()) {
      if (order.symbol !== upperSymbol || order.status !== 'pending') continue;

      if (order.type === 'market') {
        const fillPrice = order.side === 'buy' ? bestAsk : bestBid;
        this.fillOrder(order, fillPrice);
      } else if (order.type === 'limit' && order.price !== undefined) {
        if (order.side === 'buy' && bestAsk <= order.price) {
          this.fillOrder(order, order.price);
        } else if (order.side === 'sell' && bestBid >= order.price) {
          this.fillOrder(order, order.price);
        }
      }
    }

    this.updatePositionPrice(upperSymbol, (bestBid + bestAsk) / 2);
  }

  private fillOrder(order: PaperOrder, price: number): void {
    const position = this.getOrCreatePosition(order.symbol);
    const fillQuantity = order.quantity - order.filledQuantity;
    const fillValue = fillQuantity * price;

    let pnl = 0;

    if (order.side === 'buy') {
      if (position.side === 'short') {
        const closingQty = Math.min(fillQuantity, position.quantity);
        pnl = closingQty * (position.entryPrice - price);
        this.recordPnL(pnl);

        if (closingQty >= position.quantity) {
          const remainingQty = fillQuantity - position.quantity;
          if (remainingQty > 0) {
            position.side = 'long';
            position.quantity = remainingQty;
            position.entryPrice = price;
          } else {
            position.side = 'flat';
            position.quantity = 0;
            position.entryPrice = 0;
          }
        } else {
          position.quantity -= closingQty;
        }
      } else {
        if (position.side === 'flat') {
          position.side = 'long';
          position.entryPrice = price;
          position.quantity = fillQuantity;
        } else {
          const totalValue = position.quantity * position.entryPrice + fillValue;
          const totalQty = position.quantity + fillQuantity;
          position.entryPrice = totalValue / totalQty;
          position.quantity = totalQty;
        }
      }
    } else {
      if (position.side === 'long') {
        const closingQty = Math.min(fillQuantity, position.quantity);
        pnl = closingQty * (price - position.entryPrice);
        this.recordPnL(pnl);

        if (closingQty >= position.quantity) {
          const remainingQty = fillQuantity - position.quantity;
          if (remainingQty > 0) {
            position.side = 'short';
            position.quantity = remainingQty;
            position.entryPrice = price;
          } else {
            position.side = 'flat';
            position.quantity = 0;
            position.entryPrice = 0;
          }
        } else {
          position.quantity -= closingQty;
        }
      } else {
        if (position.side === 'flat') {
          position.side = 'short';
          position.entryPrice = price;
          position.quantity = fillQuantity;
        } else {
          const totalValue = position.quantity * position.entryPrice + fillValue;
          const totalQty = position.quantity + fillQuantity;
          position.entryPrice = totalValue / totalQty;
          position.quantity = totalQty;
        }
      }
    }

    order.filledQuantity = order.quantity;
    order.filledPrice = price;
    order.status = 'filled';
    order.filledAt = Date.now();

    const trade: TradeRecord = {
      id: `trade-${++this.tradeIdCounter}`,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: fillQuantity,
      price,
      timestamp: Date.now(),
      pnl,
    };

    this.trades.push(trade);
    this.account.totalTrades++;

    this.updatePositionPrice(order.symbol, price);
    this.notifyListeners();
  }

  private recordPnL(pnl: number): void {
    this.account.balance += pnl;
    this.account.totalPnL += pnl;

    if (pnl > 0) {
      this.account.winCount++;
    } else if (pnl < 0) {
      this.account.lossCount++;
    }
  }

  private getOrCreatePosition(symbol: string): Position {
    let position = this.positions.get(symbol);
    if (!position) {
      position = {
        symbol,
        side: 'flat',
        quantity: 0,
        entryPrice: 0,
        currentPrice: 0,
        unrealizedPnL: 0,
        realizedPnL: 0,
      };
      this.positions.set(symbol, position);
    }
    return position;
  }

  private updatePositionPrice(symbol: string, price: number): void {
    const position = this.positions.get(symbol);
    if (!position || position.side === 'flat') return;

    position.currentPrice = price;

    if (position.side === 'long') {
      position.unrealizedPnL = position.quantity * (price - position.entryPrice);
    } else {
      position.unrealizedPnL = position.quantity * (position.entryPrice - price);
    }
  }

  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol.toUpperCase());
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.side !== 'flat');
  }

  getOpenOrders(): PaperOrder[] {
    return Array.from(this.orders.values()).filter((o) => o.status === 'pending');
  }

  getOrderHistory(): PaperOrder[] {
    return Array.from(this.orders.values());
  }

  getTradeHistory(): TradeRecord[] {
    return [...this.trades];
  }

  getAccount(): AccountState {
    return { ...this.account };
  }

  getTotalEquity(): number {
    const unrealizedPnL = this.getAllPositions().reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0
    );
    return this.account.balance + unrealizedPnL;
  }

  getWinRate(): number {
    const total = this.account.winCount + this.account.lossCount;
    if (total === 0) return 0;
    return (this.account.winCount / total) * 100;
  }

  onUpdate(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  reset(initialBalance: number = INITIAL_BALANCE): void {
    this.orders.clear();
    this.positions.clear();
    this.trades = [];
    this.orderIdCounter = 0;
    this.tradeIdCounter = 0;
    this.account = {
      balance: initialBalance,
      initialBalance,
      totalPnL: 0,
      winCount: 0,
      lossCount: 0,
      totalTrades: 0,
    };
    this.notifyListeners();
  }
}
