// Real-time trade stream (tape) - renders at 60fps using buffered data

import { useRef, useEffect, useState, memo, useMemo } from 'react';
import { cn } from '../lib/utils';
import { formatPrice, formatTime, getSideBackground } from '../utils/formatters';
import type { TradeWithAnalytics, AssetType } from '../types';
import { flushTradeBuffer, setProcessedTrades, updateVwap, clearSymbolBuffer, getTradeRate, resetTradeRateTracker } from '../services/dataBuffer';
import { enrichTradeWithAnalytics } from '../utils/calculations';

const RENDER_INTERVAL_MS = 16;  // 60fps
const MAX_VISIBLE_ROWS = 50;
const WHALE_THRESHOLD_USD = 50000;
const AGGREGATION_WINDOW_MS = 50;

// Liquidation colors
const LIQUIDATION_LONG_COLOR = '#A855F7';   // Purple for long liquidations (rekt longs)
const LIQUIDATION_SHORT_COLOR = '#F97316';  // Orange for short liquidations (rekt shorts)

// Skull icon component for liquidations
function SkullIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      width="14" 
      height="14" 
      viewBox="0 0 24 24" 
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12v8c0 1.1.9 2 2 2h4v-2H4v-2h4v-2H4v-4c0-4.42 3.58-8 8-8s8 3.58 8 8v4h-4v2h4v2h-4v2h4c1.1 0 2-.9 2-2v-8c0-5.52-4.48-10-10-10zM8 14c.83 0 1.5-.67 1.5-1.5S8.83 11 8 11s-1.5.67-1.5 1.5S7.17 14 8 14zm8 0c.83 0 1.5-.67 1.5-1.5S16.83 11 16 11s-1.5.67-1.5 1.5.67 1.5 1.5 1.5z"/>
    </svg>
  );
}

// Droplet icon (alternative liquidation icon)
function DropletIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      width="12" 
      height="12" 
      viewBox="0 0 24 24" 
      fill="currentColor"
    >
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
    </svg>
  );
}



// Number formatters
const volumeFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
const amountFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatVolume(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return volumeFormatter.format(value);
}

function formatAmount(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return amountFormatter.format(value);
}

function formatCVD(value: number): string {
  if (value === 0) return '$0';
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(3)}M`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

interface TapeTableProps {
  trades: TradeWithAnalytics[];
  assetType: AssetType;
  symbol?: string;
  pauseScroll?: boolean;
  showAnalytics?: boolean;
  maxHeight?: string;
  onTradeClick?: (trade: TradeWithAnalytics) => void;
}

interface TradeRowProps {
  trade: TradeWithAnalytics;
  assetType: AssetType;
  isNew: boolean;
  isAggregated: boolean;
  onClick?: () => void;
  showAnalytics: boolean;
}

/**
 * Get liquidation-specific styling
 */
function getLiquidationStyles(trade: TradeWithAnalytics) {
  if (!trade.isLiquidation) return null;
  
  const isLongLiq = trade.liquidationSide === 'long';
  const color = isLongLiq ? LIQUIDATION_LONG_COLOR : LIQUIDATION_SHORT_COLOR;
  
  return {
    backgroundColor: isLongLiq ? 'rgba(168, 85, 247, 0.15)' : 'rgba(249, 115, 22, 0.15)',
    borderLeftColor: color,
    boxShadow: `0 0 12px ${color}40, inset 0 0 20px ${color}10`,
    color,
  };
}

const TradeRow = memo(function TradeRow({ trade, assetType, onClick, showAnalytics }: TradeRowProps) {
  const amount = trade.price * trade.volume;
  const isWhale = amount >= WHALE_THRESHOLD_USD;
  const isLiquidation = trade.isLiquidation;
  const liquidationStyles = getLiquidationStyles(trade);
  
  // Liquidation-specific colors
  const liquidationColor = trade.liquidationSide === 'long' 
    ? LIQUIDATION_LONG_COLOR 
    : LIQUIDATION_SHORT_COLOR;
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex border-b border-gray-900/50 text-sm transition-all",
        !isLiquidation && getSideBackground(trade.side),
        isWhale && !isLiquidation && (trade.side === 'buy' 
          ? "!bg-[#001100] !border-l-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.3)]" 
          : "!bg-[#110000] !border-l-[#FF4545] shadow-[0_0_8px_rgba(255,69,69,0.3)]"),
        isLiquidation && "border-l-4 animate-pulse",
        onClick && "cursor-pointer hover:bg-gray-900/50"
      )}
      style={liquidationStyles ? {
        backgroundColor: liquidationStyles.backgroundColor,
        borderLeftColor: liquidationStyles.borderLeftColor,
        boxShadow: liquidationStyles.boxShadow,
      } : undefined}
    >
      <div className="w-24 px-3 py-1.5 text-left flex items-center gap-1">
        {isLiquidation && (
          <SkullIcon 
            className={cn(
              "flex-shrink-0",
              trade.liquidationSide === 'long' ? 'text-purple-400' : 'text-orange-400'
            )} 
          />
        )}
        <span className={cn(
          "font-mono text-xs",
          isLiquidation ? (trade.liquidationSide === 'long' ? 'text-purple-300' : 'text-orange-300') :
          isWhale ? "text-white font-bold" : "text-gray-300"
        )}>
          {formatTime(trade.timestamp)}
        </span>
      </div>
      
      <div className="w-24 px-3 py-1.5 text-right">
        <span className={cn(
          "font-mono",
          isLiquidation ? "font-bold" : "",
          isWhale && !isLiquidation ? "font-bold text-base" : "font-semibold"
        )} style={isLiquidation ? { color: liquidationColor } : undefined}>
          {isLiquidation ? '' : ''}{formatPrice(trade.price, assetType)}
        </span>
      </div>
      
      <div className="w-24 px-3 py-1.5 text-right flex items-center justify-end gap-1">
        {isLiquidation && (
          <DropletIcon 
            className={cn(
              "flex-shrink-0",
              trade.liquidationSide === 'long' ? 'text-purple-400' : 'text-orange-400'
            )} 
          />
        )}
        <span className={cn(
          "font-mono font-semibold",
          isLiquidation ? (trade.liquidationSide === 'long' ? 'text-purple-200 font-bold' : 'text-orange-200 font-bold') :
          isWhale ? "text-white text-base font-bold" : "text-gray-100"
        )}>
          {formatVolume(trade.volume)}
        </span>
      </div>
      
      <div className="w-24 px-3 py-1.5 text-right">
        <span className={cn(
          "font-mono font-semibold",
          isLiquidation ? (trade.liquidationSide === 'long' ? 'text-purple-100 font-bold' : 'text-orange-100 font-bold') :
          isWhale ? "text-white text-sm font-bold" : "text-gray-200 text-xs"
        )}>
          {formatAmount(amount)}
        </span>
      </div>
      
      <div className="w-16 px-3 py-1.5 text-center">
        {isLiquidation ? (
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider",
            trade.liquidationSide === 'long' 
              ? 'bg-purple-900/50 text-purple-300 ring-1 ring-purple-500/50' 
              : 'bg-orange-900/50 text-orange-300 ring-1 ring-orange-500/50'
          )}>
            LIQ
          </span>
        ) : (
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider",
            trade.side === 'buy' ? 'bg-[#001100] text-[#00FF41] ring-1 ring-[#00FF41]/50' 
              : trade.side === 'sell' ? 'bg-[#110000] text-[#FF4545] ring-1 ring-[#FF4545]/50' 
              : 'bg-gray-900 text-gray-400'
          )}>
            {trade.side === 'buy' ? 'BUY' : trade.side === 'sell' ? 'SELL' : '?'}
          </span>
        )}
      </div>
      
      {showAnalytics && (
        <>
          <div className="w-24 px-3 py-1.5 text-right">
            <span className="text-gray-200 font-mono font-semibold text-sm">
              {formatPrice(trade.vwap, assetType)}
            </span>
          </div>
          
          <div className="w-24 px-3 py-1.5 text-right">
            <span className={cn(
              "font-mono font-semibold",
              trade.delta > 0 ? 'text-[#00FF41]' : trade.delta < 0 ? 'text-[#FF4545]' : 'text-gray-500'
            )}>
              {formatCVD(trade.delta * trade.price)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}, (prev, next) => prev.trade.id === next.trade.id && prev.showAnalytics === next.showAnalytics);

export function TapeTable({
  trades: externalTrades,
  assetType,
  symbol,
  pauseScroll = false,
  showAnalytics = true,
  maxHeight = 'calc(100vh - 200px)',
  onTradeClick,
}: TapeTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayTrades, setDisplayTrades] = useState<TradeWithAnalytics[]>([]);
  const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());
  const [aggregatedIds, setAggregatedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ tradesPerSecond: 0, avgTradesPerSecond: 0, totalTrades: 0 });
  const [minTradeSize, setMinTradeSize] = useState(100);
  const totalTradesRef = useRef(0);
  
  // Reset on symbol change
  useEffect(() => {
    if (!symbol) return;
    setDisplayTrades([]);
    setNewTradeIds(new Set());
    setAggregatedIds(new Set());
    setStats({ tradesPerSecond: 0, avgTradesPerSecond: 0, totalTrades: 0 });
    totalTradesRef.current = 0;
    resetTradeRateTracker(symbol);
    clearSymbolBuffer(symbol);
    updateVwap(symbol, 0);
    setProcessedTrades(symbol, []);
  }, [symbol]);

  // Main render loop at 60fps
  useEffect(() => {
    if (!symbol) return;
    
    const intervalId = setInterval(() => {
      const { trades: newTrades, hasNewData } = flushTradeBuffer(symbol);
      if (!hasNewData || newTrades.length === 0) return;
      
      const enrichedTrades = newTrades.map(t => enrichTradeWithAnalytics(t, null));
      
      setDisplayTrades(prev => {
        const result = [...prev];
        const aggregatedTradeIds: string[] = [];
        
        for (const newTrade of enrichedTrades) {
          if (result.length > 0) {
            const top = result[0];
            const timeDiff = Math.abs(newTrade.timestamp - top.timestamp);
            
            // Aggregate same price/side within 50ms
            if (top.side === newTrade.side && top.price === newTrade.price && timeDiff <= AGGREGATION_WINDOW_MS) {
              result[0] = {
                ...top,
                volume: top.volume + newTrade.volume,
                timestamp: Math.max(top.timestamp, newTrade.timestamp),
                delta: newTrade.delta,
              };
              aggregatedTradeIds.push(top.id);
              continue;
            }
          }
          result.unshift(newTrade);
        }
        
        const sorted = result.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_VISIBLE_ROWS);
        setProcessedTrades(symbol, sorted);
        
        if (sorted.length > 0 && sorted[0].vwap > 0) {
          updateVwap(symbol, sorted[0].vwap);
        }
        
        if (aggregatedTradeIds.length > 0) {
          setAggregatedIds(new Set(aggregatedTradeIds));
          setTimeout(() => setAggregatedIds(new Set()), 300);
        }
        
        return sorted;
      });
      
      const newIds = new Set(enrichedTrades.map(t => t.id));
      setNewTradeIds(newIds);
      setTimeout(() => setNewTradeIds(new Set()), 500);
      
      totalTradesRef.current += newTrades.length;
      const rateStats = getTradeRate(symbol);
      setStats({
        tradesPerSecond: rateStats.current,
        avgTradesPerSecond: rateStats.avg,
        totalTrades: totalTradesRef.current,
      });
    }, RENDER_INTERVAL_MS);
    
    return () => clearInterval(intervalId);
  }, [symbol]);
  
  const tradesToDisplay = useMemo(() => {
    const source = symbol ? displayTrades : externalTrades.slice(0, MAX_VISIBLE_ROWS);
    if (minTradeSize <= 0) return source;
    return source.filter(t => (t.price * t.volume) >= minTradeSize);
  }, [symbol, displayTrades, externalTrades, minTradeSize]);
  
  useEffect(() => {
    if (!pauseScroll && containerRef.current && tradesToDisplay.length > 0) {
      containerRef.current.scrollTop = 0;
    }
  }, [tradesToDisplay.length, pauseScroll]);
  
  if (tradesToDisplay.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2 text-gray-600">...</div>
          <p>Waiting for trades...</p>
          {symbol && <p className="text-xs mt-2 text-gray-600">Listening for {symbol}</p>}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {symbol && (
        <div className="flex items-center justify-between bg-gray-800/30 px-3 py-1.5 text-xs text-gray-400 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <span>{tradesToDisplay.length} trades displayed</span>
            <div className="flex items-center gap-1.5">
              <label className="text-gray-500">Min $</label>
              <input
                type="number"
                value={minTradeSize}
                onChange={(e) => setMinTradeSize(Math.max(0, Number(e.target.value)))}
                className="w-16 px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-200 text-xs font-mono focus:outline-none focus:border-blue-500"
                min="0"
                step="100"
              />
            </div>
          </div>
          <span className="text-green-400">
            {stats.tradesPerSecond}/sec
            {stats.avgTradesPerSecond > 0 && (
              <span className="text-gray-500 ml-1">(avg: {stats.avgTradesPerSecond.toFixed(0)})</span>
            )}
          </span>
        </div>
      )}
      
      <div className="flex bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10 text-xs font-medium text-gray-400 uppercase tracking-wider">
        <div className="w-24 px-3 py-2 text-left">Time</div>
        <div className="w-24 px-3 py-2 text-right">Price</div>
        <div className="w-24 px-3 py-2 text-right">Size</div>
        <div className="w-24 px-3 py-2 text-right">Amount</div>
        <div className="w-16 px-3 py-2 text-center">Side</div>
        {showAnalytics && (
          <>
            <div className="w-24 px-3 py-2 text-right">VWAP</div>
            <div className="w-24 px-3 py-2 text-right">CVD $</div>
          </>
        )}
      </div>
      
      <div
        ref={containerRef}
        className="time-sales-container flex-1 overflow-y-auto"
        style={{ maxHeight, scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`.time-sales-container::-webkit-scrollbar { width: 0px; background: transparent; }`}</style>
        {tradesToDisplay.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            assetType={assetType}
            isNew={newTradeIds.has(trade.id)}
            isAggregated={aggregatedIds.has(trade.id)}
            onClick={onTradeClick ? () => onTradeClick(trade) : undefined}
            showAnalytics={showAnalytics}
          />
        ))}
      </div>
      
      {pauseScroll && tradesToDisplay.length > 0 && (
        <div className="absolute bottom-4 right-4 bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          Scroll Paused
        </div>
      )}
    </div>
  );
}
