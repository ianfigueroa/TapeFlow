/**
 * ExecutionPanel - Paper Trading Execution Interface
 * 
 * Provides:
 * - Order entry form (market/limit/stop orders)
 * - Position display with P&L
 * - Open orders management
 * - Trade history log
 * - Quick action buttons (flatten, cancel all)
 */

import { useState, useMemo, memo } from 'react';
import { cn } from '../lib/utils';
import { usePaperTradingStore } from '../stores/usePaperTradingStore';
import { LabelWithTooltip } from './Tooltip';
import type { OrderSide, OrderType, PaperOrder, TradeRecord, Position } from '../paper/types';

interface ExecutionPanelProps {
  symbol: string;
  currentPrice: number;
  className?: string;
}

// Format currency
function formatCurrency(value: number, decimals = 2): string {
  const prefix = value >= 0 ? '' : '-';
  return `${prefix}$${Math.abs(value).toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  })}`;
}

// Format price based on value
function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

// Format time
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// Order Entry Form
function OrderEntryForm({ 
  symbol: _symbol, 
  currentPrice,
  onSubmit,
}: { 
  symbol: string;
  currentPrice: number;
  onSubmit: (side: OrderSide, type: OrderType, quantity: number, price?: number) => void;
}) {
  // _symbol available if needed for order context
  const [side, setSide] = useState<OrderSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('0.01');
  const [limitPrice, setLimitPrice] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;
    
    const price = orderType === 'limit' ? parseFloat(limitPrice) : undefined;
    if (orderType === 'limit' && (!price || price <= 0)) return;
    
    onSubmit(side, orderType, qty, price);
    // Don't reset - keep same settings for rapid entry
  };
  
  // Estimate notional value
  const notional = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const price = orderType === 'limit' ? parseFloat(limitPrice) || currentPrice : currentPrice;
    return qty * price;
  }, [quantity, limitPrice, currentPrice, orderType]);
  
  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Buy/Sell Toggle */}
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setSide('buy')}
          className={cn(
            "py-2 rounded text-sm font-bold transition-colors",
            side === 'buy' 
              ? "bg-[#00FF41] text-black" 
              : "bg-gray-800 text-[#00FF41] border border-[#00FF41]/30 hover:bg-[#00FF41]/10"
          )}
        >
          BUY
        </button>
        <button
          type="button"
          onClick={() => setSide('sell')}
          className={cn(
            "py-2 rounded text-sm font-bold transition-colors",
            side === 'sell' 
              ? "bg-[#FF4545] text-black" 
              : "bg-gray-800 text-[#FF4545] border border-[#FF4545]/30 hover:bg-[#FF4545]/10"
          )}
        >
          SELL
        </button>
      </div>
      
      {/* Order Type */}
      <div className="flex gap-1">
        {(['market', 'limit'] as OrderType[]).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => setOrderType(type)}
            className={cn(
              "flex-1 py-1 rounded text-xs font-mono transition-colors",
              orderType === type 
                ? "bg-gray-700 text-white" 
                : "bg-gray-900 text-gray-500 hover:text-gray-300"
            )}
          >
            {type.toUpperCase()}
          </button>
        ))}
      </div>
      
      {/* Quantity */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase">Quantity</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          step="0.001"
          min="0"
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm font-mono text-white focus:border-[#00FF41] focus:outline-none"
        />
      </div>
      
      {/* Limit Price (if limit order) */}
      {orderType === 'limit' && (
        <div>
          <label className="text-[10px] text-gray-500 uppercase">Limit Price</label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={formatPrice(currentPrice)}
            step="0.01"
            min="0"
            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm font-mono text-white focus:border-[#00FF41] focus:outline-none"
          />
        </div>
      )}
      
      {/* Notional Estimate */}
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>Est. Notional</span>
        <span className="tabular-nums">{formatCurrency(notional)}</span>
      </div>
      
      {/* Submit Button */}
      <button
        type="submit"
        className={cn(
          "w-full py-2 rounded text-sm font-bold transition-colors",
          side === 'buy'
            ? "bg-[#00FF41] text-black hover:bg-[#00DD35]"
            : "bg-[#FF4545] text-black hover:bg-[#DD3535]"
        )}
      >
        {side === 'buy' ? 'BUY' : 'SELL'} {orderType === 'market' ? 'MARKET' : 'LIMIT'}
      </button>
    </form>
  );
}

// Position Display
function PositionDisplay({ 
  symbol, 
  position, 
  onFlatten 
}: { 
  symbol: string;
  position: Position | null;
  onFlatten: () => void;
}) {
  if (!position || position.side === 'flat') {
    return (
      <div className="text-center py-3 text-gray-600 text-sm">
        No position in {symbol}
      </div>
    );
  }
  
  const isLong = position.side === 'long';
  const isProfitable = position.unrealizedPnL >= 0;
  
  return (
    <div className={cn(
      "p-2 rounded border",
      isLong ? "border-[#00FF41]/30 bg-[#00FF41]/5" : "border-[#FF4545]/30 bg-[#FF4545]/5"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn(
          "text-sm font-bold",
          isLong ? "text-[#00FF41]" : "text-[#FF4545]"
        )}>
          {isLong ? 'LONG' : 'SHORT'} {position.quantity}
        </span>
        <button
          onClick={onFlatten}
          className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-white transition-colors"
        >
          FLATTEN
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Entry</span>
          <span className="text-gray-300 tabular-nums">{formatPrice(position.entryPrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Current</span>
          <span className="text-gray-300 tabular-nums">{formatPrice(position.currentPrice)}</span>
        </div>
        <div className="flex justify-between col-span-2 pt-1 border-t border-gray-800/50">
          <span className="text-gray-500">Unrealized P&L</span>
          <span className={cn(
            "tabular-nums font-bold",
            isProfitable ? "text-[#00FF41]" : "text-[#FF4545]"
          )}>
            {formatCurrency(position.unrealizedPnL)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Open Orders List
function OpenOrdersList({ 
  orders, 
  onCancel 
}: { 
  orders: PaperOrder[];
  onCancel: (orderId: string) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-2 text-gray-600 text-xs">
        No open orders
      </div>
    );
  }
  
  return (
    <div className="space-y-1">
      {orders.map(order => (
        <div 
          key={order.id}
          className="flex items-center justify-between p-1.5 bg-gray-900 rounded text-xs"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-bold",
              order.side === 'buy' ? "text-[#00FF41]" : "text-[#FF4545]"
            )}>
              {order.side.toUpperCase()}
            </span>
            <span className="text-gray-400">{order.quantity}</span>
            {order.price && (
              <span className="text-gray-500">@ {formatPrice(order.price)}</span>
            )}
          </div>
          <button
            onClick={() => onCancel(order.id)}
            className="text-gray-500 hover:text-[#FF4545] transition-colors"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// Trade History List
function TradeHistoryList({ trades }: { trades: TradeRecord[] }) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-2 text-gray-600 text-xs">
        No trades yet
      </div>
    );
  }
  
  // Show last 10 trades, most recent first
  const recentTrades = [...trades].reverse().slice(0, 10);
  
  return (
    <div className="space-y-0.5">
      {recentTrades.map(trade => (
        <div 
          key={trade.id}
          className="flex items-center justify-between py-1 text-[10px] border-b border-gray-800/50 last:border-0"
        >
          <div className="flex items-center gap-1">
            <span className={cn(
              "font-bold",
              trade.side === 'buy' ? "text-[#00FF41]" : "text-[#FF4545]"
            )}>
              {trade.side === 'buy' ? '▲' : '▼'}
            </span>
            <span className="text-gray-400 tabular-nums">{trade.quantity}</span>
            <span className="text-gray-600">@</span>
            <span className="text-gray-300 tabular-nums">{formatPrice(trade.price)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "tabular-nums",
              trade.pnl >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"
            )}>
              {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl, 2)}
            </span>
            <span className="text-gray-600">{formatTime(trade.timestamp)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export const ExecutionPanel = memo(function ExecutionPanel({
  symbol,
  currentPrice,
  className,
}: ExecutionPanelProps) {
  const [activeTab, setActiveTab] = useState<'order' | 'orders' | 'history'>('order');
  
  const {
    enabled,
    setEnabled,
    position,
    openOrders,
    tradeHistory,
    account,
    equity,
    winRate,
    placeOrder,
    cancelOrder,
    flattenPosition,
    setActiveSymbol,
  } = usePaperTradingStore();
  
  // Update active symbol when component mounts/symbol changes
  useMemo(() => {
    setActiveSymbol(symbol);
  }, [symbol, setActiveSymbol]);
  
  const handlePlaceOrder = (side: OrderSide, type: OrderType, quantity: number, price?: number) => {
    if (!enabled) {
      setEnabled(true);
    }
    placeOrder(symbol, side, type, quantity, price);
  };
  
  // Filter orders for current symbol
  const symbolOrders = useMemo(() => 
    openOrders.filter(o => o.symbol.toUpperCase() === symbol.toUpperCase()),
    [openOrders, symbol]
  );
  
  const symbolTrades = useMemo(() => 
    tradeHistory.filter(t => t.symbol.toUpperCase() === symbol.toUpperCase()),
    [tradeHistory, symbol]
  );
  
  return (
    <div className={cn(
      "bg-black rounded border border-gray-800 overflow-hidden font-mono flex flex-col",
      className
    )}>
      {/* Header with Account Summary */}
      <div className="p-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-orange-500 uppercase">&gt;&gt; PAPER TRADING</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold transition-colors",
              enabled 
                ? "bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30" 
                : "bg-gray-800 text-gray-500 hover:text-white"
            )}
          >
            {enabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
        
        {/* Account Stats */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-gray-500">Equity</div>
            <div className="text-white tabular-nums">{formatCurrency(equity)}</div>
          </div>
          <div>
            <div className="text-gray-500">P&L</div>
            <div className={cn(
              "tabular-nums",
              account.totalPnL >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"
            )}>
              {formatCurrency(account.totalPnL)}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Win Rate</div>
            <div className={cn(
              "tabular-nums",
              winRate >= 50 ? "text-[#00FF41]" : winRate > 0 ? "text-[#FF4545]" : "text-gray-400"
            )}>
              {winRate.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
      
      {/* Tab Bar */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        {[
          { id: 'order', label: 'ORDER' },
          { id: 'orders', label: `OPEN (${symbolOrders.length})` },
          { id: 'history', label: 'HISTORY' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-mono transition-colors",
              activeTab === tab.id
                ? "text-[#00FF41] border-b-2 border-[#00FF41] bg-black"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {activeTab === 'order' && (
          <div className="space-y-3">
            {/* Current Price Display */}
            <div className="text-center py-1 border-b border-gray-800/50">
              <div className="text-[10px] text-gray-500 uppercase">
                <LabelWithTooltip label={symbol} term="Symbol" />
              </div>
              <div className="text-lg font-bold text-white tabular-nums">
                {formatPrice(currentPrice)}
              </div>
            </div>
            
            {/* Position Display */}
            <PositionDisplay 
              symbol={symbol}
              position={position}
              onFlatten={() => flattenPosition(symbol)}
            />
            
            {/* Order Entry Form */}
            <OrderEntryForm
              symbol={symbol}
              currentPrice={currentPrice}
              onSubmit={handlePlaceOrder}
            />
          </div>
        )}
        
        {activeTab === 'orders' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase">Open Orders</span>
              {symbolOrders.length > 0 && (
                <button
                  onClick={() => symbolOrders.forEach(o => cancelOrder(o.id))}
                  className="text-[10px] text-[#FF4545] hover:text-[#FF6666] transition-colors"
                >
                  Cancel All
                </button>
              )}
            </div>
            <OpenOrdersList 
              orders={symbolOrders}
              onCancel={cancelOrder}
            />
          </div>
        )}
        
        {activeTab === 'history' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase">Trade History</span>
              <span className="text-[10px] text-gray-600">
                {symbolTrades.length} trades
              </span>
            </div>
            <TradeHistoryList trades={symbolTrades} />
          </div>
        )}
      </div>
      
      {/* Footer with Quick Actions */}
      <div className="p-2 border-t border-gray-800 flex gap-2 flex-shrink-0">
        <button
          onClick={() => flattenPosition(symbol)}
          disabled={!position || position.side === 'flat'}
          className={cn(
            "flex-1 py-1.5 rounded text-xs font-bold transition-colors",
            position && position.side !== 'flat'
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
              : "bg-gray-900 text-gray-600 cursor-not-allowed"
          )}
        >
          FLATTEN
        </button>
        <button
          onClick={() => symbolOrders.forEach(o => cancelOrder(o.id))}
          disabled={symbolOrders.length === 0}
          className={cn(
            "flex-1 py-1.5 rounded text-xs font-bold transition-colors",
            symbolOrders.length > 0
              ? "bg-[#FF4545]/20 text-[#FF4545] border border-[#FF4545]/30 hover:bg-[#FF4545]/30"
              : "bg-gray-900 text-gray-600 cursor-not-allowed"
          )}
        >
          CANCEL ALL
        </button>
      </div>
    </div>
  );
});

export default ExecutionPanel;
