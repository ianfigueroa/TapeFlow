/**
 * VolumeProfile - Visual volume distribution with POC, VAH/VAL
 * 
 * Displays volume at price levels as horizontal bars with:
 * - Point of Control (POC) highlighted
 * - Value Area High/Low markers
 * - Buy/Sell delta per level
 * - HVN/LVN indicators
 */

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { VolumeProfileCalculator, type VolumeProfile as VolumeProfileResult, type VolumeNode } from '../analytics/calculators/VolumeProfileCalculator';
import { subscribeToTrades } from '../services/dataBuffer';
import { LabelWithTooltip } from './Tooltip';
import type { Trade } from '../types';

// Adapted type for display
interface VolumeLevel {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
}

interface VolumeProfileProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

// Format volume for display
function formatVolume(vol: number): string {
  if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
  if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
  return vol.toFixed(0);
}

// Format price
function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(0);
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

// Volume bar component
function VolumeBar({ 
  level, 
  maxVolume,
  poc,
  vah,
  val,
  currentPrice,
  isHvn,
  isLvn,
}: { 
  level: VolumeLevel;
  maxVolume: number;
  poc: number;
  vah: number;
  val: number;
  currentPrice: number;
  isHvn: boolean;
  isLvn: boolean;
}) {
  const totalWidth = (level.volume / maxVolume) * 100;
  const buyWidth = (level.buyVolume / maxVolume) * 100;
  const sellWidth = (level.sellVolume / maxVolume) * 100;
  
  const isPoc = Math.abs(level.price - poc) < 0.01;
  const isVah = Math.abs(level.price - vah) < 0.01;
  const isVal = Math.abs(level.price - val) < 0.01;
  const isCurrentPrice = Math.abs(level.price - currentPrice) / currentPrice < 0.001;
  
  return (
    <div className={cn(
      "flex items-center gap-1 h-5 group",
      isPoc && "bg-yellow-500/10",
      isCurrentPrice && "bg-blue-500/10"
    )}>
      {/* Price label */}
      <div className={cn(
        "w-16 text-right text-[10px] tabular-nums flex-shrink-0",
        isPoc ? "text-yellow-400 font-bold" : 
        isVah ? "text-[#00FF41]" :
        isVal ? "text-[#FF4545]" :
        isCurrentPrice ? "text-blue-400" :
        "text-gray-500"
      )}>
        {formatPrice(level.price)}
      </div>
      
      {/* Markers */}
      <div className="w-8 text-[8px] text-center flex-shrink-0">
        {isPoc && <span className="text-yellow-400">POC</span>}
        {isVah && !isPoc && <span className="text-[#00FF41]">VAH</span>}
        {isVal && !isPoc && <span className="text-[#FF4545]">VAL</span>}
        {isHvn && !isPoc && !isVah && !isVal && <span className="text-gray-500">HVN</span>}
        {isLvn && !isPoc && !isVah && !isVal && <span className="text-gray-700">LVN</span>}
      </div>
      
      {/* Volume bar */}
      <div className="flex-1 h-3 bg-gray-900 rounded-sm overflow-hidden relative">
        {/* Sell volume (red, left side) */}
        <div 
          className="absolute left-0 h-full bg-[#FF4545]/60 transition-all duration-150"
          style={{ width: `${sellWidth}%` }}
        />
        {/* Buy volume (green, overlaid) */}
        <div 
          className="absolute left-0 h-full bg-[#00FF41]/60 transition-all duration-150"
          style={{ width: `${buyWidth}%` }}
        />
        {/* Total outline if POC */}
        {isPoc && (
          <div 
            className="absolute left-0 h-full border border-yellow-400/50 rounded-sm"
            style={{ width: `${totalWidth}%` }}
          />
        )}
      </div>
      
      {/* Volume label */}
      <div className={cn(
        "w-14 text-right text-[10px] tabular-nums flex-shrink-0",
        isPoc ? "text-yellow-400" : "text-gray-600"
      )}>
        {formatVolume(level.volume)}
      </div>
      
      {/* Delta */}
      <div className={cn(
        "w-12 text-right text-[10px] tabular-nums flex-shrink-0",
        level.delta > 0 ? "text-[#00FF41]" : level.delta < 0 ? "text-[#FF4545]" : "text-gray-600"
      )}>
        {level.delta > 0 ? '+' : ''}{formatVolume(level.delta)}
      </div>
    </div>
  );
}

export const VolumeProfile = memo(function VolumeProfile({
  symbol,
  className,
  compact: _compact = false,
}: VolumeProfileProps) {
  const [profile, setProfile] = useState<VolumeProfileResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(0);
  
  const calculatorRef = useRef<VolumeProfileCalculator | null>(null);
  const currentSymbolRef = useRef<string>(symbol);
  
  // Initialize calculator
  useEffect(() => {
    if (currentSymbolRef.current !== symbol) {
      calculatorRef.current = null;
      setProfile(null);
      currentSymbolRef.current = symbol;
    }
    
    if (!calculatorRef.current) {
      // Determine tick size based on symbol - use smaller ticks for granular profile
      let tickSize = 1;
      const upperSymbol = symbol.toUpperCase();
      if (upperSymbol.includes('BTC')) tickSize = 1;  // $1 ticks for BTC (was $10)
      else if (upperSymbol.includes('ETH')) tickSize = 0.5;  // $0.50 ticks for ETH (was $1)
      else if (upperSymbol.includes('SOL')) tickSize = 0.05;  // $0.05 ticks for SOL (was $0.10)
      else tickSize = 0.01;
      
      calculatorRef.current = new VolumeProfileCalculator({
        tickSize,
        rowCount: 100,  // Increased from 50 for more detail
        valueAreaPercent: 70,
      });
    }
  }, [symbol]);
  
  // Process trades
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      
      setCurrentPrice(trade.price);
      
      if (calculatorRef.current) {
        calculatorRef.current.addTrade(
          trade.price,
          trade.volume,
          trade.side as 'buy' | 'sell',
          trade.timestamp
        );
      }
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Update profile periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (calculatorRef.current) {
        const newProfile = calculatorRef.current.getProfile(symbol);
        setProfile(newProfile);
      }
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  // Get HVN/LVN status for a level
  const isHvn = useCallback((price: number): boolean => {
    if (!profile) return false;
    return profile.hvnLevels.some((p: number) => Math.abs(p - price) < 0.01);
  }, [profile]);
  
  const isLvn = useCallback((price: number): boolean => {
    if (!profile) return false;
    return profile.lvnLevels.some((p: number) => Math.abs(p - price) < 0.01);
  }, [profile]);
  
  // Get max volume for scaling
  const maxVolume = profile?.nodes.reduce((max: number, l: VolumeNode) => Math.max(max, l.totalVolume), 0) || 1;
  
  // Convert nodes to display levels - show more rows for better distribution
  const displayLevels: VolumeLevel[] = (profile?.nodes || [])
    .filter((l: VolumeNode) => l.totalVolume > 0)
    .sort((a: VolumeNode, b: VolumeNode) => b.price - a.price)
    .slice(0, 50)  // Increased from 30 for fuller profile
    .map((node: VolumeNode) => ({
      price: node.price,
      volume: node.totalVolume,
      buyVolume: node.buyVolume,
      sellVolume: node.sellVolume,
      delta: node.delta,
    }));
  
  // Value area percent comes from profile calculation
  const valueAreaPercent = 70; // Default value area
  
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
          <span className="text-xs text-orange-500 uppercase">&gt;&gt; <LabelWithTooltip label="VOLUME PROFILE" term="Volume Profile" /></span>
          {profile && (
            <span className="text-[10px] text-gray-600">
              VA {valueAreaPercent}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {profile && (
            <span className="text-xs text-yellow-400 tabular-nums">
              <LabelWithTooltip label="POC" term="POC" />: {formatPrice(profile.poc)}
            </span>
          )}
          <span className="text-gray-600 text-xs">{isExpanded ? '[-]' : '[+]'}</span>
        </div>
      </div>
      
      {/* Stats bar */}
      {isExpanded && profile && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800/50 text-[10px]">
          <span className="text-[#00FF41]">
            <LabelWithTooltip label="VAH" term="VAH" />: {formatPrice(profile.vah)}
          </span>
          <span className="text-yellow-400">
            <LabelWithTooltip label="POC" term="POC" />: {formatPrice(profile.poc)}
          </span>
          <span className="text-[#FF4545]">
            <LabelWithTooltip label="VAL" term="VAL" />: {formatPrice(profile.val)}
          </span>
          <span className="text-gray-500">
            Vol: {formatVolume(profile.totalVolume)}
          </span>
        </div>
      )}
      
      {/* Column headers */}
      {isExpanded && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-800/50 text-[9px] text-gray-600 uppercase">
          <div className="w-16 text-right">Price</div>
          <div className="w-8 text-center">Mark</div>
          <div className="flex-1 text-center">Volume Distribution</div>
          <div className="w-14 text-right">Volume</div>
          <div className="w-12 text-right">Delta</div>
        </div>
      )}
      
      {/* Profile */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto min-h-0 px-1 py-0.5" style={{ maxHeight: '400px' }}>
          {displayLevels.length > 0 ? (
            displayLevels.map((level) => (
              <VolumeBar
                key={level.price}
                level={level}
                maxVolume={maxVolume}
                poc={profile!.poc}
                vah={profile!.vah}
                val={profile!.val}
                currentPrice={currentPrice}
                isHvn={isHvn(level.price)}
                isLvn={isLvn(level.price)}
              />
            ))
          ) : (
            <div className="flex items-center justify-center p-4 text-gray-600 text-xs">
              <span className="animate-pulse">Collecting volume data...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
