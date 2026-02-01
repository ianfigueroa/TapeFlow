/**
 * DOMLadder - Depth of Market Ladder
 * 
 * Professional-style DOM ladder showing:
 * - Order book depth at each price level
 * - Bid/Ask imbalance visualization
 * - Price ladder centered on current price
 * - Cumulative depth
 * - Large order highlighting
 */

import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { cn } from '../lib/utils';
import { subscribeToTrades, getCurrentOrderBook } from '../services/dataBuffer';
import type { Trade, OrderBook } from '../types';

interface DOMLadderProps {
  symbol: string;
  className?: string;
  levels?: number; // Number of price levels to show
}

// Format size for display
function formatSize(size: number): string {
  if (size >= 1000000) return (size / 1000000).toFixed(2) + 'M';
  if (size >= 1000) return (size / 1000).toFixed(2) + 'K';
  if (size >= 1) return size.toFixed(2);
  return size.toFixed(4);
}

// Format price based on magnitude
function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 1000) return price.toFixed(1);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(6);
}

// Determine if this is a large order (iceberg detection hint)
function isLargeOrder(size: number, avgSize: number): boolean {
  return size > avgSize * 3;
}

// DOM level row component
function DOMLevel({
  price,
  bidSize,
  askSize,
  maxSize,
  isCurrentPrice,
  avgSize,
}: {
  price: number;
  bidSize: number;
  askSize: number;
  maxSize: number;
  isCurrentPrice: boolean;
  avgSize: number;
}) {
  const bidWidth = maxSize > 0 ? (bidSize / maxSize) * 100 : 0;
  const askWidth = maxSize > 0 ? (askSize / maxSize) * 100 : 0;
  
  const isLargeBid = bidSize > 0 && isLargeOrder(bidSize, avgSize);
  const isLargeAsk = askSize > 0 && isLargeOrder(askSize, avgSize);
  
  return (
    <div className={cn(
      "grid grid-cols-[1fr_80px_1fr] items-center h-6 text-xs border-b border-gray-800/30",
      isCurrentPrice && "bg-blue-500/10 border-blue-500/30"
    )}>
      {/* Bid side */}
      <div className="relative h-full flex items-center justify-end pr-2">
        {/* Background bar */}
        <div 
          className={cn(
            "absolute right-0 h-full transition-all duration-100",
            isLargeBid ? "bg-[#00FF41]/30" : "bg-[#00FF41]/15"
          )}
          style={{ width: `${bidWidth}%` }}
        />
        {/* Size text */}
        {bidSize > 0 && (
          <span className={cn(
            "relative z-10 tabular-nums",
            isLargeBid ? "text-[#00FF41] font-bold" : "text-[#00FF41]/80"
          )}>
            {formatSize(bidSize)}
          </span>
        )}
      </div>
      
      {/* Price */}
      <div className={cn(
        "text-center tabular-nums font-medium px-2 border-x border-gray-800/50",
        isCurrentPrice ? "text-white bg-blue-500/20" : "text-gray-400"
      )}>
        {formatPrice(price)}
      </div>
      
      {/* Ask side */}
      <div className="relative h-full flex items-center pl-2">
        {/* Background bar */}
        <div 
          className={cn(
            "absolute left-0 h-full transition-all duration-100",
            isLargeAsk ? "bg-[#FF4545]/30" : "bg-[#FF4545]/15"
          )}
          style={{ width: `${askWidth}%` }}
        />
        {/* Size text */}
        {askSize > 0 && (
          <span className={cn(
            "relative z-10 tabular-nums",
            isLargeAsk ? "text-[#FF4545] font-bold" : "text-[#FF4545]/80"
          )}>
            {formatSize(askSize)}
          </span>
        )}
      </div>
    </div>
  );
}

export const DOMLadder = memo(function DOMLadder({
  symbol,
  className,
  levels = 20,
}: DOMLadderProps) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  
  const currentSymbolRef = useRef<string>(symbol);
  
  // Reset on symbol change
  useEffect(() => {
    if (currentSymbolRef.current !== symbol) {
      setOrderBook(null);
      setCurrentPrice(0);
      currentSymbolRef.current = symbol;
    }
  }, [symbol]);
  
  // Subscribe to trades for current price
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      setCurrentPrice(trade.price);
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Poll order book
  useEffect(() => {
    const interval = setInterval(() => {
      const ob = getCurrentOrderBook(symbol);
      if (ob) {
        setOrderBook(ob);
      }
    }, 100); // 10fps for smooth DOM updates
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  // Build price ladder
  const ladder = useMemo(() => {
    if (!orderBook || currentPrice === 0) return [];
    
    // Determine tick size
    let tickSize = 0.01;
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol.includes('BTC')) tickSize = 1;
    else if (upperSymbol.includes('ETH')) tickSize = 0.1;
    else if (upperSymbol.includes('SOL')) tickSize = 0.01;
    
    // Create price ladder centered on current price
    const halfLevels = Math.floor(levels / 2);
    const startPrice = Math.round(currentPrice / tickSize) * tickSize + (halfLevels * tickSize);
    
    // Build bid/ask maps for O(1) lookup
    const bidMap = new Map<string, number>();
    const askMap = new Map<string, number>();
    
    orderBook.bids.forEach(level => {
      const key = (Math.round(level.price / tickSize) * tickSize).toFixed(8);
      bidMap.set(key, (bidMap.get(key) || 0) + level.size);
    });
    
    orderBook.asks.forEach(level => {
      const key = (Math.round(level.price / tickSize) * tickSize).toFixed(8);
      askMap.set(key, (askMap.get(key) || 0) + level.size);
    });
    
    // Build ladder array
    const result: Array<{
      price: number;
      bidSize: number;
      askSize: number;
      cumulativeBid: number;
      cumulativeAsk: number;
    }> = [];
    
    let cumulativeBid = 0;
    let cumulativeAsk = 0;
    
    for (let i = 0; i < levels; i++) {
      const price = startPrice - (i * tickSize);
      const key = price.toFixed(8);
      const bidSize = bidMap.get(key) || 0;
      const askSize = askMap.get(key) || 0;
      
      // Accumulate from top for asks, bottom for bids
      if (price > currentPrice) {
        cumulativeAsk += askSize;
      } else {
        cumulativeBid += bidSize;
      }
      
      result.push({
        price,
        bidSize,
        askSize,
        cumulativeBid,
        cumulativeAsk,
      });
    }
    
    return result;
  }, [orderBook, currentPrice, symbol, levels]);
  
  // Calculate stats
  const stats = useMemo(() => {
    if (!orderBook) return { bidTotal: 0, askTotal: 0, imbalance: 0, avgSize: 1 };
    
    const bidTotal = orderBook.bids.reduce((sum, l) => sum + l.size, 0);
    const askTotal = orderBook.asks.reduce((sum, l) => sum + l.size, 0);
    const total = bidTotal + askTotal;
    const imbalance = total > 0 ? ((bidTotal - askTotal) / total) * 100 : 0;
    
    const allSizes = [...orderBook.bids, ...orderBook.asks].map(l => l.size);
    const avgSize = allSizes.length > 0 ? allSizes.reduce((a, b) => a + b, 0) / allSizes.length : 1;
    
    return { bidTotal, askTotal, imbalance, avgSize };
  }, [orderBook]);
  
  // Max size for bar scaling
  const maxSize = useMemo(() => {
    return ladder.reduce((max, l) => Math.max(max, l.bidSize, l.askSize), 1);
  }, [ladder]);
  
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
          <span className="text-xs text-orange-500 uppercase">&gt;&gt; DOM LADDER</span>
          {orderBook && (
            <span className="text-[10px] text-gray-600">
              Spread: {orderBook.spread.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Imbalance indicator */}
          <div className={cn(
            "px-1.5 py-0.5 text-[10px] rounded",
            stats.imbalance > 20 ? "bg-[#00FF41]/10 text-[#00FF41]" :
            stats.imbalance < -20 ? "bg-[#FF4545]/10 text-[#FF4545]" :
            "bg-gray-800 text-gray-400"
          )}>
            {stats.imbalance > 0 ? '+' : ''}{stats.imbalance.toFixed(0)}%
          </div>
          <span className="text-gray-600 text-xs">{isExpanded ? '[-]' : '[+]'}</span>
        </div>
      </div>
      
      {/* Stats bar */}
      {isExpanded && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800/50 text-[10px]">
          <span className="text-[#00FF41]">
            Bids: {formatSize(stats.bidTotal)}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-[#FF4545]">
            Asks: {formatSize(stats.askTotal)}
          </span>
        </div>
      )}
      
      {/* Column headers */}
      {isExpanded && (
        <div className="grid grid-cols-[1fr_80px_1fr] px-0 py-1 border-b border-gray-800/50 text-[9px] text-gray-600 uppercase">
          <div className="text-right pr-2">Bid Size</div>
          <div className="text-center">Price</div>
          <div className="text-left pl-2">Ask Size</div>
        </div>
      )}
      
      {/* Ladder */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '400px' }}>
          {ladder.length > 0 ? (
            ladder.map((level) => (
              <DOMLevel
                key={level.price}
                price={level.price}
                bidSize={level.bidSize}
                askSize={level.askSize}
                maxSize={maxSize}
                isCurrentPrice={Math.abs(level.price - currentPrice) / currentPrice < 0.0005}
                avgSize={stats.avgSize}
              />
            ))
          ) : (
            <div className="flex items-center justify-center p-4 text-gray-600 text-xs">
              <span className="animate-pulse">Waiting for order book data...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
