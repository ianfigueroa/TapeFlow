/**
 * SessionStats - Display session statistics from Web Worker
 * 
 * This component displays VWAP, Volume, Delta, and other session stats
 * with ZERO main-thread calculation - all data comes pre-computed from
 * the Web Worker.
 */

import { memo } from 'react';
import { cn } from '../lib/utils';
import { useWorkerData } from '../hooks/useWorkerData';

interface SessionStatsProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toFixed(2);
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return sign + formatVolume(delta);
}

export const SessionStats = memo(function SessionStats({
  symbol,
  className,
  compact = false,
}: SessionStatsProps) {
  const { sessionStats, cvd, cvd5m, cvd15m, isLoading, isConnected } = useWorkerData({ symbol });
  
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-2 text-xs text-gray-600 font-mono", className)}>
        <span className="animate-pulse">Loading session stats...</span>
      </div>
    );
  }

  const deltaColor = sessionStats.sessionDelta > 0 ? 'text-[#00FF41]' : 
                     sessionStats.sessionDelta < 0 ? 'text-[#FF4545]' : 'text-gray-400';
  
  const cvdColor = cvd > 0 ? 'text-[#00FF41]' : cvd < 0 ? 'text-[#FF4545]' : 'text-gray-400';

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3 px-2 py-1 text-xs font-mono", className)}>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">VWAP:</span>
          <span className="text-yellow-400 tabular-nums">{formatPrice(sessionStats.vwap)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Δ:</span>
          <span className={cn("tabular-nums", deltaColor)}>
            {formatDelta(sessionStats.sessionDelta)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Vol:</span>
          <span className="text-white tabular-nums">{formatVolume(sessionStats.totalVolume)}</span>
        </div>
        {!isConnected && (
          <span className="text-red-500 text-[10px]">●</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("bg-black border border-gray-800 rounded p-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono font-semibold text-cyan-500 tracking-wider">
          SESSION STATS
        </span>
        <span className={cn(
          "text-[10px] font-mono",
          isConnected ? "text-[#00FF41]" : "text-gray-600"
        )}>
          {isConnected ? '● LIVE' : '○ OFFLINE'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
        {/* VWAP */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">VWAP</div>
          <div className="text-sm text-yellow-400 font-semibold tabular-nums">
            ${formatPrice(sessionStats.vwap)}
          </div>
        </div>

        {/* Session Delta */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">SESSION Δ</div>
          <div className={cn("text-sm font-semibold tabular-nums", deltaColor)}>
            {formatDelta(sessionStats.sessionDelta)}
          </div>
        </div>

        {/* Total Volume */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">VOLUME</div>
          <div className="text-sm text-white font-semibold tabular-nums">
            {formatVolume(sessionStats.totalVolume)}
          </div>
          <div className="flex gap-2 mt-1 text-[10px]">
            <span className="text-[#00FF41]">↑{formatVolume(sessionStats.totalBuyVolume)}</span>
            <span className="text-[#FF4545]">↓{formatVolume(sessionStats.totalSellVolume)}</span>
          </div>
        </div>

        {/* Trades */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">TRADES</div>
          <div className="text-sm text-white font-semibold tabular-nums">
            {sessionStats.tradeCount.toLocaleString()}
          </div>
        </div>

        {/* CVD 5m */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">CVD 5M</div>
          <div className={cn("text-sm font-semibold tabular-nums", cvdColor)}>
            {formatDelta(cvd5m)}
          </div>
        </div>

        {/* CVD 15m */}
        <div className="bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">CVD 15M</div>
          <div className={cn("text-sm font-semibold tabular-nums", cvdColor)}>
            {formatDelta(cvd15m)}
          </div>
        </div>

        {/* Session Range */}
        <div className="col-span-2 bg-gray-900/50 rounded p-2">
          <div className="text-[10px] text-gray-500 uppercase mb-1">SESSION RANGE</div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-500">L: </span>
              <span className="text-[#FF4545] tabular-nums">{formatPrice(sessionStats.sessionLow)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500">O: </span>
              <span className="text-gray-400 tabular-nums">{formatPrice(sessionStats.sessionOpen)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500">H: </span>
              <span className="text-[#00FF41] tabular-nums">{formatPrice(sessionStats.sessionHigh)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default SessionStats;
