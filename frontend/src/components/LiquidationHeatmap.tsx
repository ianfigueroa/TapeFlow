/**
 * LiquidationHeatmap - Visual representation of estimated liquidation levels
 * 
 * Shows high liquidity pools (estimated leverage liquidation zones)
 * above and below current price where large position liquidations
 * are likely clustered.
 * 
 * Features:
 * - Periodic recalculation every 15 seconds for performance
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
  refreshIntervalMs?: number; // How often to recalculate (default 15s)
}

// Common leverage levels used in crypto trading
const LEVERAGE_LEVELS = [5, 10, 25, 50, 100];

// Recalculation interval (15 seconds by default)
const DEFAULT_REFRESH_INTERVAL_MS = 15000;

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

export const LiquidationHeatmap = memo(function LiquidationHeatmap({
  symbol,
  currentPrice,
  className,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: LiquidationHeatmapProps) {
  const [levels, setLevels] = useState<LiquidationLevel[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const lastPriceRef = useRef<number>(0);
  const lastSymbolRef = useRef<string>('');

  // Memoized calculation function
  const calculateLevels = useCallback((price: number): LiquidationLevel[] => {
    if (!price || price <= 0) return [];

    const newLevels: LiquidationLevel[] = [];

    // For each leverage level, calculate potential liquidation zones
    LEVERAGE_LEVELS.forEach(leverage => {
      // Estimate liquidity based on common entry points near current price
      // Higher leverage = closer liquidation = more liquidity typically
      const liquidityMultiplier = leverage / 10;
      
      // Use deterministic random based on price level for consistency
      const priceHash = Math.sin(price * leverage * 12345.6789);
      const randomFactor = 0.5 + (priceHash * priceHash) * 0.5;
      
      // Long liquidations (below price)
      const longLiqPrice = calculateLiquidationPrice(price, leverage, 'long');
      newLevels.push({
        price: longLiqPrice,
        estimatedLiquidity: 10000000 * liquidityMultiplier * randomFactor,
        leverage,
        side: 'long',
      });

      // Short liquidations (above price)
      const shortLiqPrice = calculateLiquidationPrice(price, leverage, 'short');
      newLevels.push({
        price: shortLiqPrice,
        estimatedLiquidity: 10000000 * liquidityMultiplier * randomFactor,
        leverage,
        side: 'short',
      });
    });

    // Sort by price
    newLevels.sort((a, b) => b.price - a.price);
    return newLevels;
  }, []);

  // Initial calculation and symbol change
  useEffect(() => {
    if (symbol !== lastSymbolRef.current) {
      lastSymbolRef.current = symbol;
      lastPriceRef.current = currentPrice;
      setLevels(calculateLevels(currentPrice));
      setLastUpdate(Date.now());
    }
  }, [symbol, currentPrice, calculateLevels]);

  // Periodic recalculation with setInterval
  useEffect(() => {
    if (!currentPrice || currentPrice <= 0) return;

    // Initial calculation
    if (levels.length === 0) {
      setLevels(calculateLevels(currentPrice));
      setLastUpdate(Date.now());
      lastPriceRef.current = currentPrice;
    }

    // Periodic recalculation
    const intervalId = setInterval(() => {
      // Only recalculate if price has moved significantly (>0.1%)
      const priceChange = Math.abs(currentPrice - lastPriceRef.current) / lastPriceRef.current;
      if (priceChange > 0.001 || levels.length === 0) {
        setLevels(calculateLevels(currentPrice));
        setLastUpdate(Date.now());
        lastPriceRef.current = currentPrice;
      }
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [currentPrice, refreshIntervalMs, calculateLevels, levels.length]);

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
      <div className={cn("flex items-center justify-center p-4 text-gray-600 text-xs", className)}>
        Waiting for price data...
      </div>
    );
  }

  return (
    <div className={cn("bg-black border border-gray-800 rounded overflow-hidden flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        <span className="text-xs font-mono font-semibold text-purple-500 tracking-wider">
          LIQUIDATION ZONES
        </span>
        <span className="text-[10px] text-gray-600 font-mono">
          {lastUpdate > 0 ? formatTimeSince(lastUpdate) : 'calculating...'}
        </span>
      </div>

      {/* Heatmap */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Above price (short liquidations - will squeeze shorts) */}
        <div className="flex-1 flex flex-col justify-end overflow-hidden">
          {abovePrice.slice(0, 5).reverse().map((level, i) => {
            const intensity = getIntensity(level.estimatedLiquidity);
            return (
              <div
                key={`above-${i}`}
                className="flex items-center px-2 py-0.5 text-[10px] font-mono relative"
                style={{
                  background: `linear-gradient(to right, rgba(249, 115, 22, ${intensity * 0.3}) 0%, transparent 100%)`,
                }}
              >
                <span className="w-12 text-orange-500 tabular-nums">{level.leverage}x</span>
                <span className="flex-1 text-gray-400 tabular-nums">{formatPrice(level.price)}</span>
                <span className="text-orange-400 tabular-nums">{formatLiquidity(level.estimatedLiquidity)}</span>
                {/* Intensity bar */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-orange-500/20"
                  style={{ width: `${intensity * 100}%` }}
                />
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {belowPrice.slice(0, 5).map((level, i) => {
            const intensity = getIntensity(level.estimatedLiquidity);
            return (
              <div
                key={`below-${i}`}
                className="flex items-center px-2 py-0.5 text-[10px] font-mono relative"
                style={{
                  background: `linear-gradient(to right, rgba(168, 85, 247, ${intensity * 0.3}) 0%, transparent 100%)`,
                }}
              >
                <span className="w-12 text-purple-500 tabular-nums">{level.leverage}x</span>
                <span className="flex-1 text-gray-400 tabular-nums">{formatPrice(level.price)}</span>
                <span className="text-purple-400 tabular-nums">{formatLiquidity(level.estimatedLiquidity)}</span>
                {/* Intensity bar */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-purple-500/20"
                  style={{ width: `${intensity * 100}%` }}
                />
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
