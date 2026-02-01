/**
 * TradeHistoryPanel - Session Trade Log
 * 
 * Displays a log of all paper trades executed in the current session
 * with P&L breakdown and summary statistics
 */

import { memo, useMemo } from 'react';
import { cn } from '../lib/utils';
import { usePaperTradingStore } from '../stores/usePaperTradingStore';
import { useTheme } from '../hooks/useTheme';

interface TradeHistoryPanelProps {
  symbol?: string;
  className?: string;
  maxRows?: number;
}

// Format timestamp to HH:MM:SS
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// Format price based on magnitude
function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 1000) return price.toFixed(1);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(6);
}

// Format P&L
function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  if (Math.abs(pnl) >= 1000) return `${sign}$${(pnl / 1000).toFixed(2)}K`;
  return `${sign}$${pnl.toFixed(2)}`;
}

export const TradeHistoryPanel = memo(function TradeHistoryPanel({ 
  symbol, 
  className,
  maxRows = 50 
}: TradeHistoryPanelProps) {
  const { isHacker } = useTheme();
  const buyColor = isHacker ? '#00FF41' : '#22c55e';
  const sellColor = isHacker ? '#FF4545' : '#ef4444';
  
  const { enabled, tradeHistory } = usePaperTradingStore();
  
  // Suppress lint warnings for colors (used in styling)
  void buyColor;
  void sellColor;
  
  // Filter trades by symbol if provided, and limit to maxRows
  const displayTrades = useMemo(() => {
    let trades = tradeHistory;
    if (symbol) {
      trades = trades.filter(t => t.symbol === symbol);
    }
    // Sort by timestamp descending (newest first)
    return [...trades].sort((a, b) => b.timestamp - a.timestamp).slice(0, maxRows);
  }, [tradeHistory, symbol, maxRows]);
  
  // Calculate summary stats
  const stats = useMemo(() => {
    const total = displayTrades.length;
    const winners = displayTrades.filter(t => t.pnl > 0).length;
    const losers = displayTrades.filter(t => t.pnl < 0).length;
    const totalPnL = displayTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgWin = winners > 0 
      ? displayTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winners 
      : 0;
    const avgLoss = losers > 0 
      ? Math.abs(displayTrades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losers)
      : 0;
    
    return { total, winners, losers, totalPnL, avgWin, avgLoss };
  }, [displayTrades]);
  
  if (!enabled) {
    return (
      <div className={cn("bg-black border border-gray-800 rounded p-4", className)}>
        <div className="text-center">
          <p className="text-xs font-mono text-gray-600">Paper trading disabled</p>
          <p className="text-[10px] text-gray-700 mt-1">Enable paper trading to see trade history</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col bg-black border border-gray-800 rounded overflow-hidden h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        <span className="text-xs font-mono font-semibold text-cyan-500 tracking-wider">
          TRADE HISTORY
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-gray-500">
            <span className="text-[#00FF41]">{stats.winners}W</span>
            {' / '}
            <span className="text-[#FF4545]">{stats.losers}L</span>
          </span>
          <span className={stats.totalPnL >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"}>
            {formatPnL(stats.totalPnL)}
          </span>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[60px_50px_70px_60px_60px_70px] gap-1 px-2 py-1.5 border-b border-gray-800 bg-gray-900/20 text-[9px] font-mono text-gray-600 uppercase flex-shrink-0">
        <div>Time</div>
        <div>Side</div>
        <div className="text-right">Price</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
        <div className="text-right">P&L</div>
      </div>

      {/* Trade Rows */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {displayTrades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs font-mono">
            No trades yet
          </div>
        ) : (
          displayTrades.map((trade) => {
            const isBuy = trade.side === 'buy';
            const isProfitable = trade.pnl > 0;
            const isBreakeven = trade.pnl === 0;
            
            return (
              <div 
                key={trade.id}
                className={cn(
                  "grid grid-cols-[60px_50px_70px_60px_60px_70px] gap-1 px-2 py-1.5 border-b border-gray-800/50 text-[10px] font-mono",
                  isProfitable && "bg-[#00FF41]/5",
                  !isProfitable && !isBreakeven && "bg-[#FF4545]/5"
                )}
              >
                {/* Time */}
                <div className="text-gray-400 tabular-nums">
                  {formatTime(trade.timestamp)}
                </div>
                
                {/* Side */}
                <div className={isBuy ? "text-[#00FF41] font-bold" : "text-[#FF4545] font-bold"}>
                  {trade.side.toUpperCase()}
                </div>
                
                {/* Price */}
                <div className="text-right text-gray-300 tabular-nums">
                  {formatPrice(trade.price)}
                </div>
                
                {/* Size */}
                <div className="text-right text-gray-400 tabular-nums">
                  {trade.quantity.toFixed(4)}
                </div>
                
                {/* Total Value */}
                <div className="text-right text-gray-400 tabular-nums">
                  ${(trade.price * trade.quantity).toFixed(0)}
                </div>
                
                {/* P&L */}
                <div className={cn(
                  "text-right font-bold tabular-nums",
                  isProfitable ? "text-[#00FF41]" : isBreakeven ? "text-gray-500" : "text-[#FF4545]"
                )}>
                  {formatPnL(trade.pnl)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary Footer */}
      {displayTrades.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 bg-gray-900/20 flex-shrink-0">
          <div className="flex items-center gap-4 text-[9px] font-mono text-gray-500">
            <span>
              Avg Win: <span className="text-[#00FF41]">{formatPnL(stats.avgWin)}</span>
            </span>
            <span>
              Avg Loss: <span className="text-[#FF4545]">{formatPnL(-stats.avgLoss)}</span>
            </span>
          </div>
          <div className="text-[9px] font-mono text-gray-600">
            {stats.total} trades
          </div>
        </div>
      )}
    </div>
  );
});

export default TradeHistoryPanel;
