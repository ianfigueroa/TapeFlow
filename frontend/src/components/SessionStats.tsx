/**
 * SessionStats - Analytics panel showing session-level statistics
 * 
 * Displays:
 * - Session OHLC (Open, High, Low, Current)
 * - VWAP with standard deviation bands
 * - Cumulative Delta with trend
 * - Volume statistics (total, buy, sell)
 * - Largest trades in session
 * - Trade rate / momentum indicators
 */

import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { cn } from '../lib/utils';
import { subscribeToTrades, getTradeRate } from '../services/dataBuffer';
import { LabelWithTooltip } from './Tooltip';
import type { Trade } from '../types';

interface SessionStatsProps {
  symbol: string;
  className?: string;
}

interface SessionOHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VWAPData {
  vwap: number;
  upper1SD: number;
  lower1SD: number;
  upper2SD: number;
  lower2SD: number;
}

interface LargeTrade {
  id: string;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  timestamp: number;
  notional: number;
}

// Session tracking state
interface SessionState {
  startTime: number;
  ohlc: SessionOHLC;
  vwap: VWAPData;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  cumulativeDelta: number;
  tradeCount: number;
  largestTrades: LargeTrade[];
  // For VWAP calculation
  sumPriceVolume: number;
  sumVolume: number;
  sumSqDev: number;
}

// Format price for display
function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

// Format volume for display
function formatVolume(vol: number): string {
  if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
  if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
  return vol.toFixed(2);
}

// Format USD notional
function formatNotional(notional: number): string {
  if (notional >= 1000000) return '$' + (notional / 1000000).toFixed(2) + 'M';
  if (notional >= 1000) return '$' + (notional / 1000).toFixed(1) + 'K';
  return '$' + notional.toFixed(0);
}

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// Format session duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Stat row component
function StatRow({ 
  label, 
  value, 
  valueClass,
  tooltip,
  compact = false,
}: { 
  label: string; 
  value: string | React.ReactNode;
  valueClass?: string;
  tooltip?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between",
      compact ? "py-0.5" : "py-1"
    )}>
      <span className="text-gray-500 text-[10px] uppercase">
        {tooltip ? <LabelWithTooltip label={label} term={tooltip} /> : label}
      </span>
      <span className={cn("text-xs tabular-nums font-mono", valueClass)}>
        {value}
      </span>
    </div>
  );
}

export const SessionStats = memo(function SessionStats({
  symbol,
  className,
}: SessionStatsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [session, setSession] = useState<SessionState | null>(null);
  const [tradeRate, setTradeRate] = useState({ current: 0, avg: 0 });
  
  const sessionRef = useRef<SessionState | null>(null);
  const symbolRef = useRef<string>(symbol);
  
  // Reset session when symbol changes
  useEffect(() => {
    if (symbolRef.current !== symbol) {
      sessionRef.current = null;
      setSession(null);
      symbolRef.current = symbol;
    }
  }, [symbol]);
  
  // Subscribe to trades and update session stats
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    const MAX_LARGE_TRADES = 10;
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      
      const now = Date.now();
      let s = sessionRef.current;
      
      // Initialize session on first trade
      if (!s) {
        s = {
          startTime: now,
          ohlc: { open: trade.price, high: trade.price, low: trade.price, close: trade.price },
          vwap: { vwap: trade.price, upper1SD: trade.price, lower1SD: trade.price, upper2SD: trade.price, lower2SD: trade.price },
          totalVolume: 0,
          buyVolume: 0,
          sellVolume: 0,
          cumulativeDelta: 0,
          tradeCount: 0,
          largestTrades: [],
          sumPriceVolume: 0,
          sumVolume: 0,
          sumSqDev: 0,
        };
        sessionRef.current = s;
      }
      
      // Update OHLC
      s.ohlc.high = Math.max(s.ohlc.high, trade.price);
      s.ohlc.low = Math.min(s.ohlc.low, trade.price);
      s.ohlc.close = trade.price;
      
      // Update volumes
      s.totalVolume += trade.volume;
      if (trade.side === 'buy') {
        s.buyVolume += trade.volume;
        s.cumulativeDelta += trade.volume;
      } else if (trade.side === 'sell') {
        s.sellVolume += trade.volume;
        s.cumulativeDelta -= trade.volume;
      }
      
      // Update VWAP
      s.sumPriceVolume += trade.price * trade.volume;
      s.sumVolume += trade.volume;
      const newVwap = s.sumVolume > 0 ? s.sumPriceVolume / s.sumVolume : trade.price;
      
      // Update sum of squared deviations for standard deviation
      const deviation = trade.price - newVwap;
      s.sumSqDev += deviation * deviation * trade.volume;
      
      // Calculate standard deviation
      const variance = s.sumVolume > 0 ? s.sumSqDev / s.sumVolume : 0;
      const stdDev = Math.sqrt(variance);
      
      s.vwap = {
        vwap: newVwap,
        upper1SD: newVwap + stdDev,
        lower1SD: newVwap - stdDev,
        upper2SD: newVwap + 2 * stdDev,
        lower2SD: newVwap - 2 * stdDev,
      };
      
      s.tradeCount++;
      
      // Track large trades (by notional value)
      const notional = trade.price * trade.volume;
      const largeTrade: LargeTrade = {
        id: trade.id,
        price: trade.price,
        volume: trade.volume,
        side: trade.side as 'buy' | 'sell',
        timestamp: trade.timestamp || now,
        notional,
      };
      
      // Insert into sorted list of largest trades
      const insertIndex = s.largestTrades.findIndex(t => t.notional < notional);
      if (insertIndex === -1) {
        s.largestTrades.push(largeTrade);
      } else {
        s.largestTrades.splice(insertIndex, 0, largeTrade);
      }
      
      // Keep only top N largest trades
      if (s.largestTrades.length > MAX_LARGE_TRADES) {
        s.largestTrades.pop();
      }
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Update UI periodically (not on every trade for performance)
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionRef.current) {
        setSession({ ...sessionRef.current });
      }
      
      // Update trade rate
      const rate = getTradeRate(symbol);
      setTradeRate({ current: rate.current, avg: rate.avg });
    }, 250); // 4fps UI update
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  // Compute derived stats
  const stats = useMemo(() => {
    if (!session) return null;
    
    const priceChange = session.ohlc.close - session.ohlc.open;
    const priceChangePercent = session.ohlc.open > 0 ? (priceChange / session.ohlc.open) * 100 : 0;
    const sessionDuration = Date.now() - session.startTime;
    const vwapDeviation = session.vwap.vwap > 0 
      ? ((session.ohlc.close - session.vwap.vwap) / session.vwap.vwap) * 100 
      : 0;
    const buyRatio = session.totalVolume > 0 
      ? (session.buyVolume / session.totalVolume) * 100 
      : 50;
    
    return {
      priceChange,
      priceChangePercent,
      sessionDuration,
      vwapDeviation,
      buyRatio,
    };
  }, [session]);
  
  return (
    <div className={cn(
      "bg-black rounded border border-gray-800 overflow-hidden font-mono flex flex-col",
      className
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-900/50 transition-colors flex-shrink-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-cyan-500 uppercase">&gt;&gt; SESSION ANALYTICS</span>
          {session && stats && (
            <span className="text-[10px] text-gray-600">
              {formatDuration(stats.sessionDuration)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {session && stats && (
            <span className={cn(
              "text-xs tabular-nums",
              stats.priceChangePercent >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"
            )}>
              {stats.priceChangePercent >= 0 ? '+' : ''}{stats.priceChangePercent.toFixed(2)}%
            </span>
          )}
          <span className="text-gray-600 text-xs">{isExpanded ? '[-]' : '[+]'}</span>
        </div>
      </div>
      
      {isExpanded && session && stats && (
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-3">
          {/* Session OHLC */}
          <div className="border-b border-gray-800/50 pb-2">
            <div className="text-[9px] text-gray-600 uppercase mb-1">Session OHLC</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <StatRow label="Open" value={formatPrice(session.ohlc.open)} tooltip="Open Price" compact />
              <StatRow label="High" value={formatPrice(session.ohlc.high)} valueClass="text-[#00FF41]" tooltip="High Price" compact />
              <StatRow label="Low" value={formatPrice(session.ohlc.low)} valueClass="text-[#FF4545]" tooltip="Low Price" compact />
              <StatRow 
                label="Last" 
                value={formatPrice(session.ohlc.close)} 
                valueClass={stats.priceChange >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"}
                tooltip="Last Price"
                compact 
              />
            </div>
            <div className="mt-1 pt-1 border-t border-gray-800/30">
              <StatRow 
                label="Change" 
                value={`${stats.priceChange >= 0 ? '+' : ''}${formatPrice(stats.priceChange)} (${stats.priceChangePercent >= 0 ? '+' : ''}${stats.priceChangePercent.toFixed(2)}%)`}
                valueClass={stats.priceChange >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"}
                compact 
              />
            </div>
          </div>
          
          {/* VWAP Bands */}
          <div className="border-b border-gray-800/50 pb-2">
            <div className="text-[9px] text-gray-600 uppercase mb-1">
              <LabelWithTooltip label="VWAP Bands" term="VWAP" />
            </div>
            <StatRow 
              label="VWAP" 
              value={formatPrice(session.vwap.vwap)}
              valueClass="text-yellow-400 font-bold"
              compact 
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <StatRow label="+1σ" value={formatPrice(session.vwap.upper1SD)} valueClass="text-[#00FF41]/70" compact />
              <StatRow label="-1σ" value={formatPrice(session.vwap.lower1SD)} valueClass="text-[#FF4545]/70" compact />
              <StatRow label="+2σ" value={formatPrice(session.vwap.upper2SD)} valueClass="text-[#00FF41]/50" compact />
              <StatRow label="-2σ" value={formatPrice(session.vwap.lower2SD)} valueClass="text-[#FF4545]/50" compact />
            </div>
            <div className="mt-1 pt-1 border-t border-gray-800/30">
              <StatRow 
                label="Deviation" 
                value={`${stats.vwapDeviation >= 0 ? '+' : ''}${stats.vwapDeviation.toFixed(3)}%`}
                valueClass={stats.vwapDeviation >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"}
                compact 
              />
            </div>
          </div>
          
          {/* Volume & Delta */}
          <div className="border-b border-gray-800/50 pb-2">
            <div className="text-[9px] text-gray-600 uppercase mb-1">Volume & Delta</div>
            <StatRow label="Total" value={formatVolume(session.totalVolume)} compact />
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <StatRow label="Buy Vol" value={formatVolume(session.buyVolume)} valueClass="text-[#00FF41]" compact />
              <StatRow label="Sell Vol" value={formatVolume(session.sellVolume)} valueClass="text-[#FF4545]" compact />
            </div>
            
            {/* Buy/Sell ratio bar */}
            <div className="mt-1 h-2 bg-gray-900 rounded overflow-hidden flex">
              <div 
                className="h-full bg-[#00FF41]/60 transition-all duration-300"
                style={{ width: `${stats.buyRatio}%` }}
              />
              <div 
                className="h-full bg-[#FF4545]/60 transition-all duration-300"
                style={{ width: `${100 - stats.buyRatio}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>{stats.buyRatio.toFixed(1)}% Buys</span>
              <span>{(100 - stats.buyRatio).toFixed(1)}% Sells</span>
            </div>
            
            <div className="mt-1 pt-1 border-t border-gray-800/30">
              <StatRow 
                label="Cum. Delta" 
                value={`${session.cumulativeDelta >= 0 ? '+' : ''}${formatVolume(session.cumulativeDelta)}`}
                valueClass={session.cumulativeDelta >= 0 ? "text-[#00FF41]" : "text-[#FF4545]"}
                tooltip="CVD"
                compact 
              />
            </div>
          </div>
          
          {/* Trade Activity */}
          <div className="border-b border-gray-800/50 pb-2">
            <div className="text-[9px] text-gray-600 uppercase mb-1">Trade Activity</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <StatRow label="Trades" value={session.tradeCount.toLocaleString()} compact />
              <StatRow 
                label="Rate" 
                value={`${tradeRate.current}/s`}
                valueClass={tradeRate.current > 50 ? "text-yellow-400" : tradeRate.current > 10 ? "text-orange-400" : "text-gray-400"}
                compact 
              />
            </div>
            <StatRow 
              label="Avg Rate" 
              value={`${tradeRate.avg.toFixed(1)}/s`}
              valueClass="text-gray-500"
              compact 
            />
          </div>
          
          {/* Largest Trades */}
          <div>
            <div className="text-[9px] text-gray-600 uppercase mb-1">Largest Trades</div>
            <div className="space-y-0.5">
              {session.largestTrades.slice(0, 5).map((trade, i) => (
                <div 
                  key={trade.id || i}
                  className={cn(
                    "flex items-center justify-between py-0.5 px-1 rounded text-[10px]",
                    trade.side === 'buy' ? "bg-[#00FF41]/5" : "bg-[#FF4545]/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-bold",
                      trade.side === 'buy' ? "text-[#00FF41]" : "text-[#FF4545]"
                    )}>
                      {trade.side === 'buy' ? '▲' : '▼'}
                    </span>
                    <span className="text-gray-400 tabular-nums">{formatPrice(trade.price)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 tabular-nums">{formatVolume(trade.volume)}</span>
                    <span className={cn(
                      "tabular-nums",
                      trade.side === 'buy' ? "text-[#00FF41]" : "text-[#FF4545]"
                    )}>
                      {formatNotional(trade.notional)}
                    </span>
                    <span className="text-gray-600 text-[9px]">{formatTimeAgo(trade.timestamp)}</span>
                  </div>
                </div>
              ))}
              {session.largestTrades.length === 0 && (
                <div className="text-gray-600 text-center py-2">Collecting data...</div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {isExpanded && !session && (
        <div className="flex-1 flex items-center justify-center p-4">
          <span className="text-gray-600 text-xs animate-pulse">Waiting for trades...</span>
        </div>
      )}
    </div>
  );
});

export default SessionStats;
