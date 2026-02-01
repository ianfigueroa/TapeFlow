/**
 * ImbalanceMeter - Visual bar showing bid/ask liquidity ratio for top N levels
 * 
 * Professional quant tool showing real-time order book imbalance.
 * Forces re-render when orderBook data changes.
 */

import { useMemo, memo, useEffect, useState, useRef } from 'react';
import { cn } from '../lib/utils';
import type { OrderBook } from '../types';

interface ImbalanceMeterProps {
  orderBook: OrderBook | null;
  levels?: number;
  orientation?: 'horizontal' | 'vertical';
  showLabels?: boolean;
  className?: string;
}

// Custom comparison to force re-render when orderbook content changes
function arePropsEqual(prev: ImbalanceMeterProps, next: ImbalanceMeterProps): boolean {
  if (prev.levels !== next.levels) return false;
  if (prev.orientation !== next.orientation) return false;
  if (prev.showLabels !== next.showLabels) return false;
  if (prev.className !== next.className) return false;
  
  // Force re-render if orderBook reference changed or is null
  if (!prev.orderBook || !next.orderBook) return prev.orderBook === next.orderBook;
  
  // Compare timestamps - if different, data changed
  if (prev.orderBook.timestamp !== next.orderBook.timestamp) return false;
  
  // Compare top bid/ask prices as a quick change detection
  const prevBidPrice = prev.orderBook.bids[0]?.price ?? 0;
  const nextBidPrice = next.orderBook.bids[0]?.price ?? 0;
  const prevAskPrice = prev.orderBook.asks[0]?.price ?? 0;
  const nextAskPrice = next.orderBook.asks[0]?.price ?? 0;
  
  return prevBidPrice === nextBidPrice && prevAskPrice === nextAskPrice;
}

export const ImbalanceMeter = memo(function ImbalanceMeter({
  orderBook,
  levels = 10,
  orientation = 'vertical',
  showLabels = true,
  className,
}: ImbalanceMeterProps) {
  // Force update counter for animation
  const [, setUpdateCount] = useState(0);
  const lastTimestampRef = useRef(0);
  
  // Force re-render when orderBook timestamp changes
  useEffect(() => {
    if (orderBook && orderBook.timestamp !== lastTimestampRef.current) {
      lastTimestampRef.current = orderBook.timestamp;
      setUpdateCount(c => c + 1);
    }
  }, [orderBook?.timestamp]);
  
  const { bidVolume, askVolume, imbalance, imbalancePercent } = useMemo(() => {
    if (!orderBook) {
      return { bidVolume: 0, askVolume: 0, imbalance: 0, imbalancePercent: 0 };
    }

    const topBids = orderBook.bids.slice(0, levels);
    const topAsks = orderBook.asks.slice(0, levels);

    const bidVol = topBids.reduce((sum, l) => sum + l.size * l.price, 0);
    const askVol = topAsks.reduce((sum, l) => sum + l.size * l.price, 0);
    const total = bidVol + askVol;
    
    return {
      bidVolume: bidVol,
      askVolume: askVol,
      imbalance: bidVol - askVol,
      imbalancePercent: total > 0 ? ((bidVol - askVol) / total) * 100 : 0,
    };
  }, [orderBook?.timestamp, orderBook?.bids, orderBook?.asks, levels]);

  const formatVolume = (vol: number): string => {
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  // Calculate bar percentages
  const total = bidVolume + askVolume;
  const bidPercent = total > 0 ? (bidVolume / total) * 100 : 50;
  const askPercent = total > 0 ? (askVolume / total) * 100 : 50;

  if (!orderBook) {
    return (
      <div className={cn("flex items-center justify-center text-gray-600 text-xs", className)}>
        Waiting for data...
      </div>
    );
  }

  if (orientation === 'horizontal') {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {showLabels && (
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-[#00FF41]">BID {formatVolume(bidVolume)}</span>
            <span className={cn(
              "font-bold",
              imbalancePercent > 0 ? "text-[#00FF41]" : imbalancePercent < 0 ? "text-[#FF4545]" : "text-gray-500"
            )}>
              {imbalancePercent >= 0 ? '+' : ''}{imbalancePercent.toFixed(1)}%
            </span>
            <span className="text-[#FF4545]">ASK {formatVolume(askVolume)}</span>
          </div>
        )}
        
        <div className="h-3 flex rounded overflow-hidden bg-gray-900 border border-gray-800">
          <div 
            className="bg-gradient-to-r from-[#00FF41]/30 to-[#00FF41]/60 transition-all duration-150"
            style={{ width: `${bidPercent}%` }}
          />
          <div 
            className="bg-gradient-to-l from-[#FF4545]/30 to-[#FF4545]/60 transition-all duration-150"
            style={{ width: `${askPercent}%` }}
          />
        </div>
        
        {showLabels && (
          <div className="text-[9px] text-gray-600 font-mono text-center">
            Top {levels} levels · Net: {formatVolume(Math.abs(imbalance))} {imbalance > 0 ? 'BID' : 'ASK'}
          </div>
        )}
      </div>
    );
  }

  // Vertical orientation (for sidebar)
  return (
    <div className={cn("flex flex-col h-full gap-1 p-2", className)}>
      {/* Header */}
      <div className="text-[10px] text-orange-500 font-mono uppercase tracking-wider">
        IMBALANCE
      </div>
      
      {/* Vertical bar */}
      <div className="flex-1 flex gap-2">
        {/* The bar itself */}
        <div className="w-6 flex flex-col rounded overflow-hidden bg-gray-900 border border-gray-800">
          <div 
            className="bg-gradient-to-b from-[#FF4545]/70 to-[#FF4545]/40 transition-all duration-150"
            style={{ height: `${askPercent}%` }}
          />
          <div 
            className="bg-gradient-to-t from-[#00FF41]/70 to-[#00FF41]/40 transition-all duration-150"
            style={{ height: `${bidPercent}%` }}
          />
        </div>
        
        {/* Labels */}
        {showLabels && (
          <div className="flex flex-col justify-between text-[10px] font-mono flex-1">
            <div className="text-[#FF4545]">
              <div className="font-semibold">ASK</div>
              <div className="text-[9px]">{formatVolume(askVolume)}</div>
              <div className="text-[9px] text-gray-500">{askPercent.toFixed(0)}%</div>
            </div>
            
            <div className={cn(
              "text-center py-1 rounded text-[11px] font-bold",
              imbalancePercent > 10 ? "text-[#00FF41] bg-[#00FF41]/10" :
              imbalancePercent < -10 ? "text-[#FF4545] bg-[#FF4545]/10" :
              "text-gray-400 bg-gray-800/50"
            )}>
              {imbalancePercent >= 0 ? '+' : ''}{imbalancePercent.toFixed(0)}%
            </div>
            
            <div className="text-[#00FF41]">
              <div className="text-[9px] text-gray-500">{bidPercent.toFixed(0)}%</div>
              <div className="text-[9px]">{formatVolume(bidVolume)}</div>
              <div className="font-semibold">BID</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="text-[9px] text-gray-600 font-mono text-center border-t border-gray-800 pt-1">
        L{levels} depth
      </div>
    </div>
  );
});

export default ImbalanceMeter;
