/**
 * LiquidationHeatmap - Visual representation of estimated liquidation levels
 * 
 * Shows high liquidity pools (estimated leverage liquidation zones)
 * above and below current price where large position liquidations
 * are likely clustered.
 * 
 * Features:
 * - Polls for data every 10 seconds (as specified)
 * - Falls back to estimation if no API data available
 * - Visual intensity based on estimated liquidity
 * - Separate zones for long and short liquidations
 * 
 * Note: True liquidation data requires exchange-specific APIs or
 * aggregated data from services like Coinglass. This component
 * estimates liquidation zones based on common leverage levels.
 */

import { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react';
import { cn } from '../lib/utils';

interface LiquidationLevel {
  price: number;
  estimatedLiquidity: number;
  leverage: number;
  side: 'long' | 'short';
}

interface LiquidationHeatmapProps {
  symbol: string;
  currentPrice: number;
  className?: string;
  refreshIntervalMs?: number; // How often to poll (default 10s per spec)
}

// Common leverage levels used in crypto trading
const LEVERAGE_LEVELS = [5, 10, 25, 50, 100];

// Polling interval (10 seconds as specified in requirements)
const DEFAULT_REFRESH_INTERVAL_MS = 10000;

// Backend proxy for Binance Futures API (avoids CORS issues)
const FUTURES_API_BASE = '/api/binance';

// Hydration state
type HydrationState = 'loading' | 'polling' | 'estimated' | 'error';

// Estimate liquidation price for a position
function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  side: 'long' | 'short'
): number {
  // Simplified liquidation formula
  // Long liquidation: entry * (1 - 1/leverage)
  // Short liquidation: entry * (1 + 1/leverage)
  const liquidationMove = 1 / leverage;
  
  if (side === 'long') {
    return entryPrice * (1 - liquidationMove * 0.9); // 90% maintenance margin
  } else {
    return entryPrice * (1 + liquidationMove * 0.9);
  }
}

/**
 * Fetch open interest data from Binance as proxy for liquidation estimation
 */
async function fetchOpenInterestData(symbol: string): Promise<{ longShortRatio: number; openInterest: number } | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase().replace('/', '').replace('-', '');
    
    // Fetch long/short ratio for better liquidation estimation
    const [ratioRes, oiRes] = await Promise.all([
      fetch(`${FUTURES_API_BASE}/longShortRatio?symbol=${normalizedSymbol}&period=5m&limit=1`),
      fetch(`${FUTURES_API_BASE}/openInterest?symbol=${normalizedSymbol}`)
    ]);
    
    let longShortRatio = 1;
    let openInterest = 0;
    
    if (ratioRes.ok) {
      const ratioData = await ratioRes.json();
      if (ratioData.length > 0) {
        longShortRatio = parseFloat(ratioData[0].longShortRatio);
      }
    }
    
    if (oiRes.ok) {
      const oiData = await oiRes.json();
      openInterest = parseFloat(oiData.openInterest);
    }
    
    return { longShortRatio, openInterest };
  } catch (error) {
    console.warn('[LiquidationHeatmap] Failed to fetch OI data:', error);
    return null;
  }
}

export const LiquidationHeatmap = memo(function LiquidationHeatmap({
  symbol,
  currentPrice,
  className,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: LiquidationHeatmapProps) {
  const [levels, setLevels] = useState<LiquidationLevel[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [hydrationState, setHydrationState] = useState<HydrationState>('loading');
  const lastSymbolRef = useRef<string>('');
  const oiDataRef = useRef<{ longShortRatio: number; openInterest: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Store currentPrice in ref to avoid restarting poll timer on every price change
  const currentPriceRef = useRef<number>(currentPrice);
  
  // Keep price ref updated without restarting the poll effect
  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Memoized calculation function - enhanced with OI data
  const calculateLevels = useCallback((price: number, oiData?: { longShortRatio: number; openInterest: number } | null): LiquidationLevel[] => {
    if (!price || price <= 0) return [];

    const newLevels: LiquidationLevel[] = [];
    
    // Use OI data to weight liquidation estimates
    const ratio = oiData?.longShortRatio || 1;
    const oi = oiData?.openInterest || 0;
    
    // More longs = more long liquidation potential below price
    const longWeight = ratio > 1 ? ratio : 1;
    const shortWeight = ratio < 1 ? 1 / ratio : 1;

    // For each leverage level, calculate potential liquidation zones
    LEVERAGE_LEVELS.forEach(leverage => {
      // Estimate liquidity based on common entry points near current price
      // Higher leverage = closer liquidation = more liquidity typically
      const baseLiquidity = oi > 0 ? (oi * price * 0.1) / LEVERAGE_LEVELS.length : 10000000;
      const liquidityMultiplier = leverage / 10;
      
      // Use deterministic random based on price level for consistency
      const priceHash = Math.sin(price * leverage * 12345.6789);
      const randomFactor = 0.5 + (priceHash * priceHash) * 0.5;
      
      // Long liquidations (below price) - weighted by long ratio
      const longLiqPrice = calculateLiquidationPrice(price, leverage, 'long');
      newLevels.push({
        price: longLiqPrice,
        estimatedLiquidity: baseLiquidity * liquidityMultiplier * randomFactor * longWeight,
        leverage,
        side: 'long',
      });

      // Short liquidations (above price) - weighted by short ratio
      const shortLiqPrice = calculateLiquidationPrice(price, leverage, 'short');
      newLevels.push({
        price: shortLiqPrice,
        estimatedLiquidity: baseLiquidity * liquidityMultiplier * randomFactor * shortWeight,
        leverage,
        side: 'short',
      });
    });

    // Sort by price
    newLevels.sort((a, b) => b.price - a.price);
    return newLevels;
  }, []);

  // Poll for data on interval (10 seconds as specified)
  // NOTE: currentPrice is read from ref inside poll() to avoid restarting timer
  useEffect(() => {
    if (!symbol) {
      setHydrationState('loading');
      return;
    }
    
    // Reset on symbol change only
    if (symbol !== lastSymbolRef.current) {
      lastSymbolRef.current = symbol;
      setLevels([]);
      setHydrationState('loading');
      oiDataRef.current = null;
    }
    
    let mounted = true;
    
    // Polling function - reads currentPrice from ref
    const poll = async () => {
      if (!mounted) return;
      
      // Read latest price from ref (doesn't restart effect)
      const priceToUse = currentPriceRef.current;
      if (!priceToUse || priceToUse <= 0) return;
      
      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      try {
        // Fetch OI data for enhanced estimation
        const oiData = await fetchOpenInterestData(symbol);
        if (!mounted) return;
        
        oiDataRef.current = oiData;
        
        // Calculate levels with fresh data using current price from ref
        const newLevels = calculateLevels(currentPriceRef.current, oiData);
        setLevels(newLevels);
        setLastUpdate(Date.now());
        
        setHydrationState(oiData ? 'polling' : 'estimated');
      } catch (error) {
        if (!mounted) return;
        // Fall back to estimation
        const newLevels = calculateLevels(currentPriceRef.current, null);
        setLevels(newLevels);
        setLastUpdate(Date.now());
        setHydrationState('estimated');
      }
    };
    
    // Initial poll immediately
    poll();
    
    // Then poll every 10 seconds (as specified) - timer won't restart on price changes
    const intervalId = setInterval(poll, refreshIntervalMs);
    
    return () => {
      mounted = false;
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [symbol, refreshIntervalMs, calculateLevels]); // Removed currentPrice from deps

  // Group levels into zones
  const { abovePrice, belowPrice, maxLiquidity } = useMemo(() => {
    const above = levels.filter(l => l.price > currentPrice);
    const below = levels.filter(l => l.price <= currentPrice);
    const max = Math.max(...levels.map(l => l.estimatedLiquidity), 1);
    return { abovePrice: above, belowPrice: below, maxLiquidity: max };
  }, [levels, currentPrice]);

  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toFixed(0);
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const formatLiquidity = (liq: number): string => {
    if (liq >= 1000000000) return `$${(liq / 1000000000).toFixed(1)}B`;
    if (liq >= 1000000) return `$${(liq / 1000000).toFixed(1)}M`;
    if (liq >= 1000) return `$${(liq / 1000).toFixed(0)}K`;
    return `$${liq.toFixed(0)}`;
  };

  const getIntensity = (liquidity: number): number => {
    return Math.min(liquidity / maxLiquidity, 1);
  };
  
  const formatTimeSince = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  if (!currentPrice) {
    return (
      <div className={cn("flex items-center justify-center p-4 text-gray-600 text-xs bg-black border border-gray-800 rounded", className)}>
        <div className="text-center font-mono">
          <div className="text-lg mb-1 animate-pulse">◐</div>
          <span className="text-[#00FF41]">&gt; Loading price data...</span>
        </div>
      </div>
    );
  }
  
  // Show loading state while fetching initial data
  if (hydrationState === 'loading' && levels.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-4 text-gray-600 text-xs bg-black border border-gray-800 rounded", className)}>
        <div className="text-center font-mono">
          <div className="text-lg mb-1 animate-spin">◐</div>
          <span className="text-purple-400">&gt; Fetching liquidation data...</span>
          {symbol && <p className="text-[10px] text-gray-700 mt-1">{symbol.toUpperCase()}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-black border border-gray-800 rounded overflow-hidden flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-purple-500 tracking-wider">
            LIQUIDATION ZONES
          </span>
          <span className={cn(
            "text-[8px] px-1 rounded font-mono",
            hydrationState === 'polling' ? "bg-purple-500/20 text-purple-400" : "bg-gray-800 text-gray-500"
          )}>
            {hydrationState === 'polling' ? 'LIVE' : 'EST'}
          </span>
        </div>
        <span className="text-[10px] text-gray-600 font-mono">
          {lastUpdate > 0 ? formatTimeSince(lastUpdate) : 'calculating...'}
        </span>
      </div>

      {/* Heatmap */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Above price (short liquidations - will squeeze shorts) */}
        <div className="flex-1 flex flex-col justify-end overflow-hidden px-1">
          {abovePrice.slice(0, 5).reverse().map((level, i) => {
            const intensity = getIntensity(level.estimatedLiquidity);
            const barWidthPercent = Math.max(5, Math.min(95, intensity * 95)); // 5-95% range
            return (
              <div
                key={`above-${i}`}
                className="flex items-center py-0.5 text-[10px] font-mono relative"
              >
                {/* Intensity bar - percentage-based width */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-orange-500/20 rounded-r"
                  style={{ width: `${barWidthPercent}%` }}
                />
                <span className="w-10 text-orange-500 tabular-nums relative z-10 pl-1">{level.leverage}x</span>
                <span className="flex-1 text-gray-400 tabular-nums relative z-10">{formatPrice(level.price)}</span>
                <span className="text-orange-400 tabular-nums relative z-10 pr-1">{formatLiquidity(level.estimatedLiquidity)}</span>
              </div>
            );
          })}
        </div>

        {/* Current price marker */}
        <div className="flex items-center px-2 py-1.5 bg-gray-900 border-y border-gray-700">
          <span className="text-xs font-mono font-bold text-white flex-1">
            ● CURRENT: {formatPrice(currentPrice)}
          </span>
          <div className="flex gap-2 text-[9px]">
            <span className="text-orange-400">▲ SHORT LIQ</span>
            <span className="text-purple-400">▼ LONG LIQ</span>
          </div>
        </div>

        {/* Below price (long liquidations - will squeeze longs) */}
        <div className="flex-1 flex flex-col overflow-hidden px-1">
          {belowPrice.slice(0, 5).map((level, i) => {
            const intensity = getIntensity(level.estimatedLiquidity);
            const barWidthPercent = Math.max(5, Math.min(95, intensity * 95)); // 5-95% range
            return (
              <div
                key={`below-${i}`}
                className="flex items-center py-0.5 text-[10px] font-mono relative"
              >
                {/* Intensity bar - percentage-based width */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-purple-500/20 rounded-r"
                  style={{ width: `${barWidthPercent}%` }}
                />
                <span className="w-10 text-purple-500 tabular-nums relative z-10 pl-1">{level.leverage}x</span>
                <span className="flex-1 text-gray-400 tabular-nums relative z-10">{formatPrice(level.price)}</span>
                <span className="text-purple-400 tabular-nums relative z-10 pr-1">{formatLiquidity(level.estimatedLiquidity)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-gray-800 bg-gray-900/20 text-[9px] text-gray-600 font-mono flex-shrink-0">
        Estimated based on common leverage levels • Not financial advice
      </div>
    </div>
  );
});

export default LiquidationHeatmap;
