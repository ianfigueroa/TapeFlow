/**
 * AnalysisDashboard - Session Statistics Panel
 * 
 * Comprehensive trading session statistics:
 * - Session High / Low / Open
 * - Total Volume Traded
 * - Cumulative Session Delta (Buy Vol - Sell Vol)
 * - VWAP (Volume-Weighted Average Price)
 * - Order Book Imbalance
 * - OPS (Orders Per Second)
 * - Spread Analysis
 * 
 * All metrics update in real-time as trades come in.
 */

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { AnalyticsEngine, type AnalyticsSnapshot } from '../../analytics';
import { subscribeToTrades, getCurrentOrderBook } from '../../services/dataBuffer';
import type { Trade } from '../../types';

interface SessionStats {
  sessionOpen: number;
  sessionHigh: number;
  sessionLow: number;
  sessionClose: number;
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  sessionDelta: number;
  vwap: number;
  tradeCount: number;
  startTime: number;
}

interface AnalysisDashboardProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

// Enhanced stat card with optional delta indicator
function StatCard({
  label,
  value,
  subValue,
  trend,
  unit,
  color,
  highlight,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  unit?: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "bg-gray-900/30 rounded p-2.5 border border-gray-800/50",
      highlight && "border-emerald-500/30 bg-emerald-900/10"
    )}>
      <div className="text-[10px] text-gray-500 uppercase mb-1 tracking-wide">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-base font-bold tabular-nums",
            color || (trend === 'up' ? 'text-[#00FF41]' : trend === 'down' ? 'text-[#FF4545]' : 'text-white')
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
        {trend && trend !== 'neutral' && (
          <span className={cn(
            "text-xs",
            trend === 'up' ? 'text-[#00FF41]' : 'text-[#FF4545]'
          )}>
            {trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>
      {subValue && (
        <div className="text-[9px] text-gray-500 mt-0.5">{subValue}</div>
      )}
    </div>
  );
}

// Large hero stat for key values
function HeroStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums font-mono", color || "text-white")}>
        {value}
      </div>
    </div>
  );
}

export const AnalysisDashboard = memo(function AnalysisDashboard({
  symbol,
  className,
  compact: _compact = false,
}: AnalysisDashboardProps) {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    sessionOpen: 0,
    sessionHigh: 0,
    sessionLow: Infinity,
    sessionClose: 0,
    totalVolume: 0,
    totalBuyVolume: 0,
    totalSellVolume: 0,
    sessionDelta: 0,
    vwap: 0,
    tradeCount: 0,
    startTime: Date.now(),
  });
  
  // VWAP calculation state
  const vwapSumRef = useRef(0);
  const vwapVolSumRef = useRef(0);
  
  const analyticsRef = useRef<AnalyticsEngine | null>(null);
  const currentSymbolRef = useRef<string>(symbol);
  
  // Format functions
  const formatPrice = useCallback((price: number) => {
    if (price === 0 || price === Infinity || price === -Infinity) return '--';
    if (price >= 1000) return `$${price.toFixed(2)}`;
    if (price >= 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(6)}`;
  }, []);
  
  const formatVolume = useCallback((vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toFixed(2);
  }, []);
  
  const formatDelta = useCallback((delta: number) => {
    const sign = delta >= 0 ? '+' : '';
    if (Math.abs(delta) >= 1000000) return `${sign}${(delta / 1000000).toFixed(2)}M`;
    if (Math.abs(delta) >= 1000) return `${sign}${(delta / 1000).toFixed(1)}K`;
    return `${sign}${delta.toFixed(2)}`;
  }, []);
  
  const formatPercent = useCallback((pct: number) => {
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  }, []);
  
  const formatDuration = useCallback((startTime: number) => {
    const diff = Date.now() - startTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, []);
  
  // Initialize analytics engine and reset on symbol change
  useEffect(() => {
    if (currentSymbolRef.current !== symbol) {
      analyticsRef.current = null;
      setSnapshot(null);
      // Reset session stats
      setSessionStats({
        sessionOpen: 0,
        sessionHigh: 0,
        sessionLow: Infinity,
        sessionClose: 0,
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        sessionDelta: 0,
        vwap: 0,
        tradeCount: 0,
        startTime: Date.now(),
      });
      vwapSumRef.current = 0;
      vwapVolSumRef.current = 0;
      currentSymbolRef.current = symbol;
    }
    
    if (!analyticsRef.current) {
      analyticsRef.current = new AnalyticsEngine(symbol);
    }
  }, [symbol]);
  
  // Process trades and update session stats
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      
      // Process in analytics engine
      analyticsRef.current?.processTrade(trade);
      
      // Update session stats
      setSessionStats(prev => {
        const newStats = { ...prev };
        
        // First trade sets the open
        if (newStats.sessionOpen === 0) {
          newStats.sessionOpen = trade.price;
        }
        
        // Update high/low
        newStats.sessionHigh = Math.max(newStats.sessionHigh, trade.price);
        newStats.sessionLow = Math.min(newStats.sessionLow, trade.price);
        newStats.sessionClose = trade.price;
        
        // Update volumes
        newStats.totalVolume += trade.volume;
        newStats.tradeCount++;
        
        if (trade.side === 'buy') {
          newStats.totalBuyVolume += trade.volume;
        } else {
          newStats.totalSellVolume += trade.volume;
        }
        
        // Update delta
        newStats.sessionDelta = newStats.totalBuyVolume - newStats.totalSellVolume;
        
        // Update VWAP
        vwapSumRef.current += trade.price * trade.volume;
        vwapVolSumRef.current += trade.volume;
        newStats.vwap = vwapVolSumRef.current > 0 
          ? vwapSumRef.current / vwapVolSumRef.current 
          : trade.price;
        
        return newStats;
      });
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Update analytics snapshot periodically (for OBI, spread, etc.)
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
    }, 1000); // Update every second for responsiveness
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  // Calculate derived values
  const priceChange = sessionStats.sessionOpen > 0 
    ? sessionStats.sessionClose - sessionStats.sessionOpen 
    : 0;
  const priceChangePercent = sessionStats.sessionOpen > 0 
    ? (priceChange / sessionStats.sessionOpen) * 100 
    : 0;
  const vwapDrift = sessionStats.vwap > 0 
    ? ((sessionStats.sessionClose - sessionStats.vwap) / sessionStats.vwap) * 100 
    : 0;
  
  return (
    <div className={cn(
      "bg-black rounded border border-gray-800 overflow-hidden font-mono flex flex-col h-full",
      className
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/30 flex-shrink-0"
      >
        <span className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">SESSION STATS</span>
        <span className="text-[10px] text-gray-500">
          {formatDuration(sessionStats.startTime)} · {sessionStats.tradeCount.toLocaleString()} trades
        </span>
      </div>
      
      {/* Content - Scrollable */}
      <div className="flex-1 p-3 overflow-y-auto min-h-0">
        {sessionStats.sessionOpen > 0 ? (
          <div className="space-y-4">
            {/* Price Summary Row */}
            <div className="grid grid-cols-3 gap-2 pb-3 border-b border-gray-800">
              <HeroStat 
                label="Session High" 
                value={formatPrice(sessionStats.sessionHigh)} 
                color="text-[#00FF41]"
              />
              <HeroStat 
                label="Last" 
                value={formatPrice(sessionStats.sessionClose)}
                color={priceChange >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"}
              />
              <HeroStat 
                label="Session Low" 
                value={formatPrice(sessionStats.sessionLow)} 
                color="text-[#FF4545]"
              />
            </div>
            
            {/* VWAP - Highlighted */}
            <div className="bg-emerald-900/20 border border-emerald-500/20 rounded p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-emerald-400 uppercase tracking-wide">VWAP</div>
                  <div className="text-xl font-bold text-white tabular-nums">
                    {formatPrice(sessionStats.vwap)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 uppercase">Drift</div>
                  <div className={cn(
                    "text-sm font-semibold tabular-nums",
                    vwapDrift > 0 ? "text-[#00FF41]" : vwapDrift < 0 ? "text-[#FF4545]" : "text-gray-400"
                  )}>
                    {formatPercent(vwapDrift)}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Volume Stats */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Total Volume"
                value={formatVolume(sessionStats.totalVolume)}
                subValue={`${sessionStats.tradeCount.toLocaleString()} trades`}
              />
              <StatCard
                label="Session Delta"
                value={formatDelta(sessionStats.sessionDelta)}
                trend={sessionStats.sessionDelta > 0 ? 'up' : sessionStats.sessionDelta < 0 ? 'down' : 'neutral'}
                subValue={`Buy: ${formatVolume(sessionStats.totalBuyVolume)} | Sell: ${formatVolume(sessionStats.totalSellVolume)}`}
              />
            </div>
            
            {/* Session Open + Change */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Session Open"
                value={formatPrice(sessionStats.sessionOpen)}
              />
              <StatCard
                label="Change"
                value={formatPercent(priceChangePercent)}
                trend={priceChangePercent > 0 ? 'up' : priceChangePercent < 0 ? 'down' : 'neutral'}
                subValue={`${priceChange >= 0 ? '+' : ''}${formatPrice(priceChange).replace('$', '')}`}
              />
            </div>
            
            {/* Market Microstructure (from analytics snapshot) */}
            {snapshot && (
              <>
                <div className="border-t border-gray-800 pt-3">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">
                    Market Microstructure
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard
                      label="Order Book Imbalance"
                      value={formatPercent(snapshot.obi)}
                      trend={snapshot.obi > 10 ? 'up' : snapshot.obi < -10 ? 'down' : 'neutral'}
                    />
                    <StatCard
                      label="OPS"
                      value={snapshot.ops.toFixed(1)}
                      unit="/s"
                      subValue={`Avg: ${snapshot.opsAvg.toFixed(1)}/s`}
                    />
                    <StatCard
                      label="Spread"
                      value={snapshot.spread.current.toFixed(2)}
                      subValue={`MA: ${snapshot.spread.ma.toFixed(2)}`}
                    />
                    <StatCard
                      label="Relative Strength"
                      value={formatPercent(snapshot.relativeStrength)}
                      trend={snapshot.relativeStrength > 0 ? 'up' : snapshot.relativeStrength < 0 ? 'down' : 'neutral'}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            <span className="animate-pulse">Waiting for trades...</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default AnalysisDashboard;