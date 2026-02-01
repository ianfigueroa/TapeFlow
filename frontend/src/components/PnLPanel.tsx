/**
 * PnLPanel - Profit & Loss Tracker
 * 
 * Displays realized and unrealized P&L for the current trading session
 * with a sparkline chart showing P&L over time
 */

import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { cn } from '../lib/utils';
import { usePaperTradingStore } from '../stores/usePaperTradingStore';
import { useTheme } from '../hooks/useTheme';

interface PnLPanelProps {
  symbol?: string;
  className?: string;
  compact?: boolean;
}

interface PnLDataPoint {
  timestamp: number;
  pnl: number;
}

// Sparkline component for P&L visualization
const Sparkline = memo(function Sparkline({ 
  data, 
  width = 100, 
  height = 30,
  color 
}: { 
  data: number[]; 
  width?: number; 
  height?: number;
  color: string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <span className="text-[9px] text-gray-600">No data</span>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  // Zero line position
  const zeroY = max > 0 && min < 0 
    ? height - ((0 - min) / range) * height 
    : max <= 0 ? 0 : height;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Zero line */}
      {min < 0 && max > 0 && (
        <line 
          x1="0" 
          y1={zeroY} 
          x2={width} 
          y2={zeroY} 
          stroke="#333" 
          strokeWidth="1" 
          strokeDasharray="2,2" 
        />
      )}
      {/* P&L line */}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
      {/* End point dot */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="2"
        fill={color}
      />
    </svg>
  );
});

export const PnLPanel = memo(function PnLPanel({ symbol, className }: PnLPanelProps) {
  const { isHacker } = useTheme();
  const buyColor = isHacker ? '#00FF41' : '#22c55e';
  const sellColor = isHacker ? '#FF4545' : '#ef4444';
  
  const { 
    enabled, 
    account, 
    position, 
    tradeHistory, 
    equity, 
    winRate,
    setActiveSymbol 
  } = usePaperTradingStore();
  
  // P&L history for sparkline
  const [pnlHistory, setPnlHistory] = useState<PnLDataPoint[]>([]);
  const lastPnlRef = useRef(0);
  
  // Set active symbol
  useEffect(() => {
    if (symbol) {
      setActiveSymbol(symbol);
    }
  }, [symbol, setActiveSymbol]);
  
  // Track P&L over time for sparkline
  useEffect(() => {
    const currentPnl = account.totalPnL + (position?.unrealizedPnL || 0);
    
    // Only add new point if P&L changed
    if (Math.abs(currentPnl - lastPnlRef.current) > 0.01) {
      lastPnlRef.current = currentPnl;
      setPnlHistory(prev => {
        const newHistory = [...prev, { timestamp: Date.now(), pnl: currentPnl }];
        // Keep last 50 points
        return newHistory.slice(-50);
      });
    }
  }, [account.totalPnL, position?.unrealizedPnL]);
  
  // Calculate session stats
  const sessionStats = useMemo(() => {
    const realized = account.totalPnL;
    const unrealized = position?.unrealizedPnL || 0;
    const total = realized + unrealized;
    const tradeCount = tradeHistory.length;
    const winningTrades = tradeHistory.filter(t => t.pnl > 0).length;
    
    return {
      realized,
      unrealized,
      total,
      tradeCount,
      winningTrades,
      winRate: tradeCount > 0 ? (winningTrades / tradeCount) * 100 : 0,
    };
  }, [account.totalPnL, position?.unrealizedPnL, tradeHistory]);
  
  const formatCurrency = (value: number): string => {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
    return `${sign}$${abs.toFixed(2)}`;
  };
  
  const pnlColor = sessionStats.total >= 0 ? buyColor : sellColor;
  const sparklineData = pnlHistory.map(p => p.pnl);
  
  if (!enabled) {
    return (
      <div className={cn("bg-black border border-gray-800 rounded p-3", className)}>
        <div className="text-center">
          <p className="text-xs font-mono text-gray-600">Paper trading disabled</p>
          <p className="text-[10px] text-gray-700 mt-1">Enable paper trading to track P&L</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col bg-black border border-gray-800 rounded overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/30">
        <span className="text-xs font-mono font-semibold text-cyan-500 tracking-wider">
          P&L TRACKER
        </span>
        <span className="text-[10px] font-mono text-gray-600">
          {sessionStats.tradeCount} trades
        </span>
      </div>

      {/* Main P&L Display */}
      <div className="px-3 py-3 flex items-center justify-between gap-4">
        <div className="flex-1">
          {/* Total P&L */}
          <div className="text-xl font-bold font-mono tabular-nums" style={{ color: pnlColor }}>
            {formatCurrency(sessionStats.total)}
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-0.5">
            TOTAL P&L
          </div>
        </div>
        
        {/* Sparkline */}
        <div className="flex-shrink-0">
          <Sparkline 
            data={sparklineData} 
            width={80} 
            height={32}
            color={pnlColor}
          />
        </div>
      </div>

      {/* Realized / Unrealized Breakdown */}
      <div className="px-3 pb-3 grid grid-cols-2 gap-3">
        {/* Realized P&L */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className={cn(
            "text-sm font-bold font-mono tabular-nums",
            sessionStats.realized >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"
          )}>
            {formatCurrency(sessionStats.realized)}
          </div>
          <div className="text-[9px] text-gray-600 font-mono">REALIZED</div>
        </div>
        
        {/* Unrealized P&L */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className={cn(
            "text-sm font-bold font-mono tabular-nums",
            sessionStats.unrealized >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"
          )}>
            {formatCurrency(sessionStats.unrealized)}
          </div>
          <div className="text-[9px] text-gray-600 font-mono">UNREALIZED</div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-3 py-2 border-t border-gray-800 bg-gray-900/20 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-gray-500">
            Win Rate: <span className={winRate >= 50 ? "text-[#00FF41]" : "text-[#FF4545]"}>{sessionStats.winRate.toFixed(0)}%</span>
          </span>
          <span className="text-gray-500">
            Equity: <span className="text-gray-400">${equity.toLocaleString()}</span>
          </span>
        </div>
        
        {/* Position indicator */}
        {position && position.side !== 'flat' && (
          <div className={cn(
            "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
            position.side === 'long' 
              ? "bg-[#00FF41]/20 text-[#00FF41]" 
              : "bg-[#FF4545]/20 text-[#FF4545]"
          )}>
            {position.side.toUpperCase()} {position.quantity}
          </div>
        )}
      </div>
    </div>
  );
});

export default PnLPanel;
