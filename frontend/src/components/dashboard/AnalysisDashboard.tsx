/**
 * AnalysisDashboard - Real-time analytics metrics panel
 * 
 * Displays key order flow analytics:
 * - CVD (Cumulative Volume Delta)
 * - OBI (Order Book Imbalance)
 * - OPS (Orders Per Second)
 * - Spread analysis
 * - VWAP comparison
 */

import { useState, useEffect, useRef, memo } from 'react';
import { cn } from '../../lib/utils';
import { AnalyticsEngine, type AnalyticsSnapshot } from '../../analytics';
import { subscribeToTrades, getCurrentOrderBook } from '../../services/dataBuffer';
import type { Trade } from '../../types';

interface AnalysisDashboardProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

// Stat card component
function StatCard({
  label,
  value,
  trend,
  unit,
  color,
}: {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  unit?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-900/30 rounded p-2 border border-gray-800/50">
      <div className="text-[9px] text-gray-500 uppercase mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            color || (trend === 'up' ? 'text-[#00FF41]' : trend === 'down' ? 'text-[#FF4545]' : 'text-white')
          )}
        >
          {value}
        </span>
        {unit && <span className="text-[10px] text-gray-500">{unit}</span>}
        {trend && trend !== 'neutral' && (
          <span className={cn(
            "text-[10px]",
            trend === 'up' ? 'text-[#00FF41]' : 'text-[#FF4545]'
          )}>
            {trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </div>
  );
}

// CVD mini chart
function CVDMiniChart({ values, width = 100, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  const latest = values[values.length - 1];
  const isPositive = latest > 0;
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline
        fill="none"
        stroke={isPositive ? '#00FF41' : '#FF4545'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

export const AnalysisDashboard = memo(function AnalysisDashboard({
  symbol,
  className,
  compact: _compact = false,
}: AnalysisDashboardProps) {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [cvdHistory, setCvdHistory] = useState<number[]>([]);
  
  const analyticsRef = useRef<AnalyticsEngine | null>(null);
  const currentSymbolRef = useRef<string>(symbol);
  
  // Initialize analytics engine
  useEffect(() => {
    if (currentSymbolRef.current !== symbol) {
      analyticsRef.current = null;
      setSnapshot(null);
      setCvdHistory([]);
      currentSymbolRef.current = symbol;
    }
    
    if (!analyticsRef.current) {
      analyticsRef.current = new AnalyticsEngine(symbol);
    }
  }, [symbol]);
  
  // Process trades
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      analyticsRef.current?.processTrade(trade);
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Update snapshot periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const analytics = analyticsRef.current;
      if (!analytics) return;
      
      // Process order book
      const orderBook = getCurrentOrderBook(symbol);
      if (orderBook) {
        analytics.processOrderBook(orderBook);
      }
      
      const newSnapshot = analytics.getSnapshot();
      setSnapshot(newSnapshot);
      
      // Track CVD history for mini chart (use 1m CVD)
      const cvd1m = newSnapshot.cvd['1m'] || 0;
      setCvdHistory(prev => {
        const next = [...prev, cvd1m];
        if (next.length > 60) next.shift(); // Keep 60 samples (2 minutes at 2s interval)
        return next;
      });
    }, 2000);
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  // Format functions
  const formatCVD = (cvd: number) => {
    const abs = Math.abs(cvd);
    if (abs >= 1000000) return (cvd / 1000000).toFixed(2) + 'M';
    if (abs >= 1000) return (cvd / 1000).toFixed(1) + 'K';
    return cvd.toFixed(0);
  };
  
  const formatPercent = (pct: number) => {
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  };
  
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };
  
  // Get CVD value from snapshot (using 1m timeframe as primary)
  const getCVDValue = (): number => {
    if (!snapshot) return 0;
    return snapshot.cvd['1m'] || 0;
  };
  
  const cvdValue = getCVDValue();
  
  return (
    <div className={cn(
      "bg-black rounded border border-gray-800 overflow-hidden font-mono flex flex-col h-full",
      className
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-900/50 transition-colors flex-shrink-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-xs text-orange-500 uppercase">&gt;&gt; ANALYTICS</span>
        <span className="text-gray-600 text-xs">{isExpanded ? '[-]' : '[+]'}</span>
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div className="flex-1 p-2 overflow-y-auto">
          {snapshot ? (
            <div className="space-y-2">
              {/* CVD Section */}
              <div className="bg-gray-900/30 rounded p-2 border border-gray-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-gray-500 uppercase">CVD (1m)</span>
                  <span className={cn(
                    "text-sm font-bold tabular-nums",
                    cvdValue > 0 ? 'text-[#00FF41]' : cvdValue < 0 ? 'text-[#FF4545]' : 'text-gray-400'
                  )}>
                    {formatCVD(cvdValue)}
                  </span>
                </div>
                <CVDMiniChart values={cvdHistory} width={180} height={24} />
              </div>
              
              {/* Grid stats */}
              <div className="grid grid-cols-2 gap-1">
                <StatCard
                  label="Order Book Imbalance"
                  value={formatPercent(snapshot.obi)}
                  trend={snapshot.obi > 10 ? 'up' : snapshot.obi < -10 ? 'down' : 'neutral'}
                />
                <StatCard
                  label="OPS (Orders/sec)"
                  value={snapshot.ops.toFixed(1)}
                  trend={snapshot.ops > 10 ? 'up' : 'neutral'}
                  unit="/s"
                />
                <StatCard
                  label="VWAP"
                  value={formatPrice(snapshot.vwap)}
                />
                <StatCard
                  label="VWAP Drift"
                  value={formatPercent(snapshot.vwapDrift)}
                  trend={snapshot.vwapDrift > 0 ? 'up' : snapshot.vwapDrift < 0 ? 'down' : 'neutral'}
                />
                <StatCard
                  label="Spread"
                  value={snapshot.spread.current.toFixed(2)}
                />
                <StatCard
                  label="Spread MA"
                  value={snapshot.spread.ma.toFixed(2)}
                />
              </div>
              
              {/* Additional metrics */}
              <div className="text-[10px] text-gray-500 border-t border-gray-800 pt-2 mt-2">
                <div className="flex justify-between">
                  <span>OBI Percent:</span>
                  <span className={snapshot.obiPercent > 0 ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
                    {formatPercent(snapshot.obiPercent)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Relative Strength:</span>
                  <span className={snapshot.relativeStrength > 0 ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
                    {formatPercent(snapshot.relativeStrength)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>OPS Average:</span>
                  <span className="text-white">{snapshot.opsAvg.toFixed(1)}/s</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-xs">
              <span className="animate-pulse">Initializing analytics...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
