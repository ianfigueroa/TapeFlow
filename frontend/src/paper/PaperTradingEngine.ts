import type {
  PaperOrder,
  Position,
  TradeRecord,
  AccountState,
  OrderSide,
  OrderType,
  PaperTradingConfig,
} from './types';
import { DEFAULT_PAPER_TRADING_CONFIG } from './types';

const INITIAL_BALANCE = 100000;

export class PaperTradingEngine {
  private orders: Map<string, PaperOrder> = new Map();
  private positions: Map<string, Position> = new Map();
  private trades: TradeRecord[] = [];
  private account: AccountState;
  private orderIdCounter: number = 0;
  private tradeIdCounter: number = 0;
  private listeners: Set<() => void> = new Set();
  private config: PaperTradingConfig;
  
  // Trailing stop tracking: orderId -> highest/lowest price seen
  private trailingStopPrices: Map<string, number> = new Map();

  constructor(initialBalance: number = INITIAL_BALANCE, config?: Partial<PaperTradingConfig>) {
    this.config = { ...DEFAULT_PAPER_TRADING_CONFIG, ...config };
    this.account = {
      balance: initialBalance,
      initialBalance,
      totalPnL: 0,
      winCount: 0,
      lossCount: 0,
      totalTrades: 0,
      totalCommission: 0,
      totalSlippage: 0,
    };
  }

  // Update configuration at runtime
  setConfig(config: Partial<PaperTradingConfig>): void {
    this.config = { ...this.config, ...config };
    this.notifyListeners();
  }

  getConfig(): PaperTradingConfig {
    return { ...this.config };
  }

  placeOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: number,
    price?: number,
    options?: {
      stopPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      trailingAmount?: number;
      trailingPercent?: boolean;
    }
  ): PaperOrder {
    const order: PaperOrder = {
      id: `order-${++this.orderIdCounter}`,
      symbol: symbol.toUpperCase(),
      side,
      type,
      quantity,
      price: (type === 'limit' || type === 'stop-limit') ? price : undefined,
      stopPrice: (type === 'stop' || type === 'stop-limit' || type === 'trailing-stop') 
        ? (options?.stopPrice ?? price) 
        : undefined,
      trailingAmount: type === 'trailing-stop' ? options?.trailingAmount : undefined,
      trailingPercent: type === 'trailing-stop' ? options?.trailingPercent : undefined,
      stopLoss: options?.stopLoss,
      takeProfit: options?.takeProfit,
      filledQuantity: 0,
      filledPrice: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.orders.set(order.id, order);
    this.notifyListeners();

    return order;
  }

  // Place a bracket order (entry + SL + TP)
  placeBracketOrder(
    symbol: string,
    side: OrderSide,
    type: 'market' | 'limit',
    quantity: number,
    entryPrice: number | undefined,
    stopLoss: number,
    takeProfit: number
  ): PaperOrder {
    const order = this.placeOrder(symbol, side, type, quantity, entryPrice, {
      stopLoss,
      takeProfit,
    });
    return order;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || (order.status !== 'pending' && order.status !== 'triggered')) return false;

    order.status = 'cancelled';
    
    // Also cancel any child orders
    if (order.childOrderIds) {
      for (const childId of order.childOrderIds) {
        const child = this.orders.get(childId);
        if (child && child.status === 'pending') {
          child.status = 'cancelled';
        }
      }
    }
    
    // Clean up trailing stop tracking
    this.trailingStopPrices.delete(orderId);
    
    this.notifyListeners();
    return true;
  }

  processMarketData(symbol: string, bestBid: number, bestAsk: number): void {
    const upperSymbol = symbol.toUpperCase();
    const midPrice = (bestBid + bestAsk) / 2;

    for (const order of this.orders.values()) {
      if (order.symbol !== upperSymbol) continue;
      if (order.status !== 'pending' && order.status !== 'triggered') continue;

      switch (order.type) {
        case 'market':
          if (order.status === 'pending') {
            const fillPrice = order.side === 'buy' ? bestAsk : bestBid;
            this.fillOrder(order, fillPrice, bestBid, bestAsk);
          }
          break;

        case 'limit':
          if (order.price !== undefined) {
            if (order.side === 'buy' && bestAsk <= order.price) {
              this.fillOrder(order, order.price, bestBid, bestAsk);
            } else if (order.side === 'sell' && bestBid >= order.price) {
              this.fillOrder(order, order.price, bestBid, bestAsk);
            }
          }
          break;

        case 'stop':
          if (order.stopPrice !== undefined) {
            // Stop buy triggers when price rises above stopPrice
            // Stop sell triggers when price falls below stopPrice
            if (order.side === 'buy' && bestAsk >= order.stopPrice) {
              this.fillOrder(order, bestAsk, bestBid, bestAsk);
            } else if (order.side === 'sell' && bestBid <= order.stopPrice) {
              this.fillOrder(order, bestBid, bestBid, bestAsk);
            }
          }
          break;

        case 'stop-limit':
          if (order.stopPrice !== undefined && order.price !== undefined) {
            // First check if stop is triggered
            if (order.status === 'pending') {
              if (order.side === 'buy' && bestAsk >= order.stopPrice) {
                order.status = 'triggered';
              } else if (order.side === 'sell' && bestBid <= order.stopPrice) {
                order.status = 'triggered';
              }
            }
            // If triggered, act as limit order
            if (order.status === 'triggered') {
              if (order.side === 'buy' && bestAsk <= order.price) {
                this.fillOrder(order, order.price, bestBid, bestAsk);
              } else if (order.side === 'sell' && bestBid >= order.price) {
                this.fillOrder(order, order.price, bestBid, bestAsk);
              }
            }
          }
          break;

        case 'trailing-stop':
          this.processTrailingStop(order, bestBid, bestAsk);
          break;
      }
    }

    // Check bracket order SL/TP for open positions
    this.checkBracketOrders(upperSymbol, bestBid, bestAsk);

    this.updatePositionPrice(upperSymbol, midPrice);
  }

  private processTrailingStop(order: PaperOrder, bestBid: number, bestAsk: number): void {
    if (order.trailingAmount === undefined) return;

    const currentPrice = order.side === 'sell' ? bestBid : bestAsk;
    const trackingPrice = this.trailingStopPrices.get(order.id);

    if (order.side === 'sell') {
      // For sell trailing stop: track highest price, trigger when price drops by trailingAmount
      const highestPrice = trackingPrice ?? currentPrice;
      const newHighest = Math.max(highestPrice, currentPrice);
      this.trailingStopPrices.set(order.id, newHighest);

      const triggerDistance = order.trailingPercent 
        ? newHighest * (order.trailingAmount / 100)
        : order.trailingAmount;
      const triggerPrice = newHighest - triggerDistance;

      if (bestBid <= triggerPrice) {
        this.fillOrder(order, bestBid, bestBid, bestAsk);
        this.trailingStopPrices.delete(order.id);
      }
    } else {
      // For buy trailing stop: track lowest price, trigger when price rises by trailingAmount
      const lowestPrice = trackingPrice ?? currentPrice;
      const newLowest = Math.min(lowestPrice, currentPrice);
      this.trailingStopPrices.set(order.id, newLowest);

      const triggerDistance = order.trailingPercent
        ? newLowest * (order.trailingAmount / 100)
        : order.trailingAmount;
      const triggerPrice = newLowest + triggerDistance;

      if (bestAsk >= triggerPrice) {
        this.fillOrder(order, bestAsk, bestBid, bestAsk);
        this.trailingStopPrices.delete(order.id);
      }
    }
  }

  private checkBracketOrders(symbol: string, bestBid: number, bestAsk: number): void {
    const position = this.positions.get(symbol);
    if (!position || position.side === 'flat') return;

    // Find filled orders with SL/TP for this position
    for (const order of this.orders.values()) {
      if (order.symbol !== symbol || order.status !== 'filled') continue;
      if (!order.stopLoss && !order.takeProfit) continue;

      // Check if SL/TP orders already exist
      if (order.childOrderIds && order.childOrderIds.length > 0) continue;

      const childIds: string[] = [];

      // Create SL order if set
      if (order.stopLoss) {
        const slSide: OrderSide = position.side === 'long' ? 'sell' : 'buy';
        const slOrder = this.placeOrder(symbol, slSide, 'stop', position.quantity, undefined, {
          stopPrice: order.stopLoss,
        });
        slOrder.parentOrderId = order.id;
        childIds.push(slOrder.id);
      }

      // Create TP order if set
      if (order.takeProfit) {
        const tpSide: OrderSide = position.side === 'long' ? 'sell' : 'buy';
        const tpOrder = this.placeOrder(symbol, tpSide, 'limit', position.quantity, order.takeProfit);
        tpOrder.parentOrderId = order.id;
        childIds.push(tpOrder.id);
      }

      order.childOrderIds = childIds;
    }

    // Cancel opposing bracket leg when one fills
    for (const order of this.orders.values()) {
      if (order.parentOrderId && order.status === 'filled') {
        const parent = this.orders.get(order.parentOrderId);
        if (parent?.childOrderIds) {
          for (const siblingId of parent.childOrderIds) {
            if (siblingId !== order.id) {
              const sibling = this.orders.get(siblingId);
              if (sibling && sibling.status === 'pending') {
                sibling.status = 'cancelled';
              }
            }
          }
        }
      }
    }
  }

  private calculateSlippage(basePrice: number, side: OrderSide): number {
    if (!this.config.slippageEnabled) return 0;

    const randomFactor = (Math.random() - 0.5) * 2 * this.config.slippageVolatility;
    const slippagePercent = this.config.slippagePercent + randomFactor;
    
    // Slippage is always unfavorable: higher for buys, lower for sells
    return side === 'buy' 
      ? basePrice * (slippagePercent / 100)
      : -basePrice * (slippagePercent / 100);
  }

  private calculateCommission(fillValue: number): number {
    if (!this.config.commissionEnabled) return 0;

    const commission = fillValue * (this.config.commissionPercent / 100);
    return Math.max(commission, this.config.commissionMin);
  }

  private fillOrder(order: PaperOrder, basePrice: number, bestBid: number, bestAsk: number): void {
    const position = this.getOrCreatePosition(order.symbol);
    const fillQuantity = order.quantity - order.filledQuantity;
    
    // Apply slippage to get actual fill price
    const slippage = this.calculateSlippage(basePrice, order.side);
    const fillPrice = basePrice + slippage;
    const fillValue = fillQuantity * fillPrice;
    
    // Calculate commission
    const commission = this.calculateCommission(fillValue);

    let pnl = 0;

    if (order.side === 'buy') {
      if (position.side === 'short') {
        const closingQty = Math.min(fillQuantity, position.quantity);
        pnl = closingQty * (position.entryPrice - fillPrice);
        this.recordPnL(pnl);

        if (closingQty >= position.quantity) {
          const remainingQty = fillQuantity - position.quantity;
          if (remainingQty > 0) {
            position.side = 'long';
            position.quantity = remainingQty;
            position.entryPrice = fillPrice;
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
          position.entryPrice = fillPrice;
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
        pnl = closingQty * (fillPrice - position.entryPrice);
        this.recordPnL(pnl);

        if (closingQty >= position.quantity) {
          const remainingQty = fillQuantity - position.quantity;
          if (remainingQty > 0) {
            position.side = 'short';
            position.quantity = remainingQty;
            position.entryPrice = fillPrice;
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
          position.entryPrice = fillPrice;
          position.quantity = fillQuantity;
        } else {
          const totalValue = position.quantity * position.entryPrice + fillValue;
          const totalQty = position.quantity + fillQuantity;
          position.entryPrice = totalValue / totalQty;
          position.quantity = totalQty;
        }
      }
    }

    // Deduct commission from balance
    this.account.balance -= commission;
    this.account.totalCommission += commission;
    this.account.totalSlippage += Math.abs(slippage) * fillQuantity;

    order.filledQuantity = order.quantity;
    order.filledPrice = fillPrice;
    order.slippage = slippage;
    order.commission = commission;
    order.status = 'filled';
    order.filledAt = Date.now();

    const trade: TradeRecord = {
      id: `trade-${++this.tradeIdCounter}`,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: fillQuantity,
      price: fillPrice,
      timestamp: Date.now(),
      pnl,
      slippage,
      commission,
    };

    this.trades.push(trade);
    this.account.totalTrades++;

    this.updatePositionPrice(order.symbol, fillPrice);
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
    return Array.from(this.orders.values()).filter(
      (o) => o.status === 'pending' || o.status === 'triggered'
    );
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
    this.trailingStopPrices.clear();
    this.orderIdCounter = 0;
    this.tradeIdCounter = 0;
    this.account = {
      balance: initialBalance,
      initialBalance,
      totalPnL: 0,
      winCount: 0,
      lossCount: 0,
      totalTrades: 0,
      totalCommission: 0,
      totalSlippage: 0,
    };
    this.notifyListeners();
  }
}
