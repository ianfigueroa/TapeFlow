/**
 * OIMonitor - Enhanced real-time Open Interest display
 * 
 * Features:
 * - Current OI value with trend indicator
 * - 5-minute delta showing recent change
 * - Sparkline chart showing OI trend over last hour
 * - Color-coded sentiment
 * 
 * Polls Binance Futures API every 5 seconds for live OI data.
 */

import { useState, useEffect, memo, useRef, useCallback } from 'react';
import { cn } from '../lib/utils';
import { LabelWithTooltip } from './Tooltip';

interface OIDataPoint {
  timestamp: number;
  value: number;
}

interface OIMonitorProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

// Binance Futures API base URL
const FUTURES_API_BASE = 'https://fapi.binance.com/fapi/v1';

// Polling interval (5 seconds as specified)
const POLL_INTERVAL_MS = 5000;

// Keep 1 hour of history (720 data points at 5 second intervals)
const MAX_HISTORY_POINTS = 720;

// Sparkline component for OI trend
function Sparkline({ 
  data, 
  width = 100, 
  height = 24,
  color = '#00FF41' 
}: { 
  data: number[]; 
  width?: number; 
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  
  // Fill area under the line
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Gradient fill */}
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <polygon
        points={areaPoints}
        fill="url(#sparklineGradient)"
      />
      
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Current value dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

export const OIMonitor = memo(function OIMonitor({
  symbol,
  className,
  compact = false,
}: OIMonitorProps) {
  const [currentOI, setCurrentOI] = useState<number | null>(null);
  const [oiHistory, setOiHistory] = useState<OIDataPoint[]>([]);
  const [delta5m, setDelta5m] = useState<number>(0);
  const [delta5mPercent, setDelta5mPercent] = useState<number>(0);
  const [deltaHour, setDeltaHour] = useState<number>(0);
  const [deltaHourPercent, setDeltaHourPercent] = useState<number>(0);
  
  // === USEREF FOR IMMEDIATE DELTA TRACKING ===
  // Store the previous OI values at specific time intervals for delta calculation
  // This ensures deltas work even on first load by storing reference points
  const previousOIRef = useRef<{
    lastValue: number | null;
    fiveMinAgo: { value: number; timestamp: number } | null;
    oneHourAgo: { value: number; timestamp: number } | null;
  }>({
    lastValue: null,
    fiveMinAgo: null,
    oneHourAgo: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Format OI value for display
  const formatOI = useCallback((value: number): string => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return value.toFixed(0);
  }, []);
  
  // Format delta with sign
  const formatDelta = useCallback((value: number): string => {
    const sign = value >= 0 ? '+' : '';
    if (Math.abs(value) >= 1_000_000_000) return `${sign}${(value / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(value) >= 1_000_000) return `${sign}${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${sign}${(value / 1_000).toFixed(0)}K`;
    return `${sign}${value.toFixed(0)}`;
  }, []);

  // Fetch OI from Binance Futures API
  const fetchOpenInterest = useCallback(async (sym: string): Promise<number | null> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const normalizedSymbol = sym.toUpperCase().replace('/', '').replace('-', '');
      
      const response = await fetch(
        `${FUTURES_API_BASE}/openInterest?symbol=${normalizedSymbol}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Fetch mark price to convert OI to USD
      const priceResponse = await fetch(
        `${FUTURES_API_BASE}/premiumIndex?symbol=${normalizedSymbol}`,
        { signal: abortControllerRef.current.signal }
      );
      
      if (!priceResponse.ok) {
        return parseFloat(data.openInterest);
      }

      const priceData = await priceResponse.json();
      const markPrice = parseFloat(priceData.markPrice);
      const oiInUSD = parseFloat(data.openInterest) * markPrice;

      return oiInUSD;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      console.error('[OIMonitor] Fetch error:', err);
      throw err;
    }
  }, []);

  // Poll for OI updates
  useEffect(() => {
    if (!symbol) return;

    let mounted = true;

    const poll = async () => {
      if (!mounted) return;

      try {
        const newOI = await fetchOpenInterest(symbol);
        if (newOI === null || !mounted) return;

        const pollTime = Date.now();
        
        // Update history
        setOiHistory(prev => {
          const newHistory = [...prev, { timestamp: pollTime, value: newOI }];
          // Keep only last hour of data
          const oneHourAgo = pollTime - 3600000;
          const filtered = newHistory.filter(p => p.timestamp > oneHourAgo);
          return filtered.slice(-MAX_HISTORY_POINTS);
        });
        
        setCurrentOI(newOI);
        setIsLoading(false);
        setError(null);
        
        // === UPDATE REF-BASED DELTA TRACKING ===
        const prevRef = previousOIRef.current;
        
        // On first value, initialize all reference points
        if (prevRef.lastValue === null) {
          prevRef.lastValue = newOI;
          prevRef.fiveMinAgo = { value: newOI, timestamp: pollTime };
          prevRef.oneHourAgo = { value: newOI, timestamp: pollTime };
        } else {
          prevRef.lastValue = newOI;
        }
        
        // Update 5-min reference point if it's been >= 5 minutes since last update
        if (prevRef.fiveMinAgo && (pollTime - prevRef.fiveMinAgo.timestamp) >= 300000) {
          // Shift: the "new" 5-min-ago value becomes the current value 
          // This gives us accurate rolling 5-min deltas
          prevRef.fiveMinAgo = { value: newOI, timestamp: pollTime };
        }
        
        // Update 1-hour reference point if it's been >= 1 hour since last update
        if (prevRef.oneHourAgo && (pollTime - prevRef.oneHourAgo.timestamp) >= 3600000) {
          prevRef.oneHourAgo = { value: newOI, timestamp: pollTime };
        }
        
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch OI');
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    poll();

    // Poll every 5 seconds
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [symbol, fetchOpenInterest]);
  
  // Calculate deltas from both history AND refs for immediate values
  useEffect(() => {
    if (currentOI === null) {
      setDelta5m(0);
      setDelta5mPercent(0);
      setDeltaHour(0);
      setDeltaHourPercent(0);
      return;
    }
    
    const now = Date.now();
    const prevRef = previousOIRef.current;
    
    // === 5 MINUTE DELTA ===
    // Try history first, then fall back to refs
    let fiveMinValue: number | null = null;
    
    if (oiHistory.length > 0) {
      const fiveMinAgo = now - 300000;
      const fiveMinPoint = oiHistory.find(p => p.timestamp >= fiveMinAgo);
      if (fiveMinPoint) {
        fiveMinValue = fiveMinPoint.value;
      }
    }
    
    // Fallback to ref-based delta if history is insufficient
    if (fiveMinValue === null && prevRef.fiveMinAgo) {
      fiveMinValue = prevRef.fiveMinAgo.value;
    }
    
    if (fiveMinValue !== null) {
      const change = currentOI - fiveMinValue;
      setDelta5m(change);
      setDelta5mPercent(fiveMinValue > 0 ? (change / fiveMinValue) * 100 : 0);
    } else {
      setDelta5m(0);
      setDelta5mPercent(0);
    }
    
    // === 1 HOUR DELTA ===
    let oneHourValue: number | null = null;
    
    if (oiHistory.length > 0) {
      const oneHourAgo = now - 3600000;
      const hourPoint = oiHistory.find(p => p.timestamp >= oneHourAgo) || oiHistory[0];
      if (hourPoint) {
        oneHourValue = hourPoint.value;
      }
    }
    
    // Fallback to ref-based delta
    if (oneHourValue === null && prevRef.oneHourAgo) {
      oneHourValue = prevRef.oneHourAgo.value;
    }
    
    if (oneHourValue !== null) {
      const change = currentOI - oneHourValue;
      setDeltaHour(change);
      setDeltaHourPercent(oneHourValue > 0 ? (change / oneHourValue) * 100 : 0);
    } else {
      setDeltaHour(0);
      setDeltaHourPercent(0);
    }
  }, [oiHistory, currentOI]);

  // Reset when symbol changes
  useEffect(() => {
    setCurrentOI(null);
    setOiHistory([]);
    setDelta5m(0);
    setDelta5mPercent(0);
    setDeltaHour(0);
    setDeltaHourPercent(0);
    setIsLoading(true);
    setError(null);
    
    // Reset refs
    previousOIRef.current = {
      lastValue: null,
      fiveMinAgo: null,
      oneHourAgo: null,
    };
  }, [symbol]);
  
  // Get sparkline data (just the values)
  const sparklineData = oiHistory.map(p => p.value);
  
  // Determine trend color
  const trendColor = delta5m > 0 ? '#00FF41' : delta5m < 0 ? '#FF4545' : '#666666';

  // Compact single-line display
  if (compact) {
    if (isLoading) {
      return (
        <div className={cn(
          "flex items-center justify-center px-3 py-2 bg-black border border-gray-800 rounded",
          className
        )}>
          <span className="text-xs text-gray-500 font-mono animate-pulse">Loading OI...</span>
        </div>
      );
    }

    if (error || currentOI === null) {
      return (
        <div className={cn(
          "flex items-center justify-between px-3 py-2 bg-black border border-gray-800 rounded",
          className
        )}>
          <span className="text-xs text-yellow-500 font-mono font-semibold">OI</span>
          <span className="text-xs text-gray-500 font-mono">{error || 'Waiting...'}</span>
        </div>
      );
    }

    return (
      <div className={cn(
        "flex items-center justify-between px-3 py-2 bg-black border border-gray-800 rounded gap-2",
        className
      )}>
        {/* Label */}
        <span className="text-xs text-yellow-500 font-mono font-semibold tracking-wider flex-shrink-0">
          OI
        </span>
        
        {/* Sparkline */}
        {sparklineData.length > 1 && (
          <div className="flex-shrink-0">
            <Sparkline data={sparklineData} width={60} height={18} color={trendColor} />
          </div>
        )}

        {/* Value + Change */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            ${formatOI(currentOI)}
          </span>
          
          <span className={cn(
            "text-xs font-mono font-semibold tabular-nums",
            delta5m > 0 ? "text-[#00FF41]" : delta5m < 0 ? "text-[#FF4545]" : "text-gray-500"
          )}>
            {delta5mPercent >= 0 ? '+' : ''}{delta5mPercent.toFixed(2)}%
          </span>

          <span className={cn(
            "text-xs",
            delta5m > 0 ? "text-[#00FF41]" : delta5m < 0 ? "text-[#FF4545]" : "text-gray-500"
          )}>
            {delta5m > 0 ? '▲' : delta5m < 0 ? '▼' : '●'}
          </span>
        </div>
      </div>
    );
  }

  // Full display (non-compact mode)
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4 text-gray-600 text-xs", className)}>
        <span className="animate-pulse">Loading OI data...</span>
      </div>
    );
  }

  if (error || currentOI === null) {
    return (
      <div className={cn(
        "flex items-center justify-center p-4 text-gray-500 text-xs font-mono",
        className
      )}>
        {error || 'Waiting for price data...'}
      </div>
    );
  }

  return (
    <div className={cn("bg-black border border-gray-800 rounded overflow-hidden flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        <span className="text-xs font-mono font-semibold text-yellow-500 tracking-wider">
          <LabelWithTooltip label="OPEN INTEREST" term="Open Interest" />
        </span>
        <span className="text-[10px] text-gray-600 font-mono">
          {symbol.toUpperCase()}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Main OI Value */}
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-white tabular-nums">
            ${formatOI(currentOI)}
          </span>
          <span className={cn(
            "text-sm",
            delta5m > 0 ? "text-[#00FF41]" : delta5m < 0 ? "text-[#FF4545]" : "text-gray-500"
          )}>
            {delta5m > 0 ? '▲' : delta5m < 0 ? '▼' : '●'}
          </span>
        </div>
        
        {/* Sparkline Chart */}
        {sparklineData.length > 1 && (
          <div className="py-2">
            <Sparkline data={sparklineData} width={140} height={32} color={trendColor} />
          </div>
        )}
        
        {/* Delta Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          {/* 5 Minute Delta */}
          <div className="bg-gray-900/50 rounded p-2">
            <div className="text-[10px] text-gray-500 uppercase mb-1">5M DELTA</div>
            <div className={cn(
              "font-semibold tabular-nums",
              delta5m > 0 ? "text-[#00FF41]" : delta5m < 0 ? "text-[#FF4545]" : "text-gray-400"
            )}>
              {formatDelta(delta5m)}
            </div>
            <div className={cn(
              "text-[10px] tabular-nums",
              delta5m > 0 ? "text-[#00FF41]/70" : delta5m < 0 ? "text-[#FF4545]/70" : "text-gray-500"
            )}>
              {delta5mPercent >= 0 ? '+' : ''}{delta5mPercent.toFixed(2)}%
            </div>
          </div>
          
          {/* 1 Hour Delta */}
          <div className="bg-gray-900/50 rounded p-2">
            <div className="text-[10px] text-gray-500 uppercase mb-1">1H DELTA</div>
            <div className={cn(
              "font-semibold tabular-nums",
              deltaHour > 0 ? "text-[#00FF41]" : deltaHour < 0 ? "text-[#FF4545]" : "text-gray-400"
            )}>
              {formatDelta(deltaHour)}
            </div>
            <div className={cn(
              "text-[10px] tabular-nums",
              deltaHour > 0 ? "text-[#00FF41]/70" : deltaHour < 0 ? "text-[#FF4545]/70" : "text-gray-500"
            )}>
              {deltaHourPercent >= 0 ? '+' : ''}{deltaHourPercent.toFixed(2)}%
            </div>
          </div>
        </div>
        
        {/* Sentiment Indicator */}
        <div className={cn(
          "text-center text-[10px] font-mono py-1 rounded",
          delta5m > 0 && deltaHour > 0 ? "bg-[#00FF41]/10 text-[#00FF41]" :
          delta5m < 0 && deltaHour < 0 ? "bg-[#FF4545]/10 text-[#FF4545]" :
          "bg-gray-800/50 text-gray-500"
        )}>
          {delta5m > 0 && deltaHour > 0 ? '● POSITIONING LONG' :
           delta5m < 0 && deltaHour < 0 ? '● REDUCING EXPOSURE' :
           delta5m > 0 ? '● SHORT-TERM BUILD' :
           delta5m < 0 ? '● SHORT-TERM EXIT' :
           '● NEUTRAL'}
        </div>
      </div>
    </div>
  );
});

export default OIMonitor;
