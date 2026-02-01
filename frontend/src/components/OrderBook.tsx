// Level 2 order book with heatmap visualization
// Optimized with requestAnimationFrame batching for high-frequency updates

import { useMemo, useEffect, useRef, useState, useCallback, memo } from 'react';
import { cn } from '../lib/utils';
import { formatPrice, formatOrderBookSize } from '../utils/formatters';
import type { OrderBook as OrderBookType, OrderBookLevel, AssetType } from '../types';
import { calculateOrderBookImbalance, getMidPrice } from '../utils/calculations';
import { globalClock } from '../services/globalClock';
import { flushOrderBookBuffer } from '../services/dataBuffer';

// RAF-based render batching
const BATCH_RENDER_INTERVAL_MS = 33; // ~30fps for order book (sufficient for human perception)

interface OrderBookProps {
  orderBook: OrderBookType | null;
  assetType: AssetType;
  symbol?: string;
  maxLevels?: number;
  showHeatmap?: boolean;
}

// Memoized heatmap bar for perf
const HeatmapBar = memo(function HeatmapBar({ intensity, side }: { intensity: number; side: 'bid' | 'ask' }) {
  const color = side === 'bid' ? 'bg-[#00FF41]' : 'bg-[#FF4545]';
  return (
    <div 
      className={cn("absolute top-0 bottom-0", color, side === 'bid' ? 'right-0' : 'left-0')}
      style={{ width: `${intensity * 100}%`, opacity: 0.08 + intensity * 0.12 }}
    />
  );
});

// Memoized order book row to prevent unnecessary re-renders
const OrderBookRow = memo(function OrderBookRow({
  level,
  side,
  maxSize,
  assetType,
  showHeatmap,
  index: _index,
}: {
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  maxSize: number;
  assetType: AssetType;
  showHeatmap: boolean;
  index: number;
}) {
  const intensity = maxSize > 0 ? Math.min(level.size / maxSize, 1) : 0;
  const isBid = side === 'bid';
  
  return (
    <div className="relative grid grid-cols-2 gap-2 px-2 py-1 text-xs font-mono hover:bg-gray-900/50">
      {showHeatmap && <HeatmapBar intensity={intensity} side={side} />}
      {isBid ? (
        <>
          <span className="text-left text-gray-400 relative z-10 tabular-nums">{formatOrderBookSize(level.size)}</span>
          <span className="text-right text-[#00FF41] font-medium relative z-10 tabular-nums">{formatPrice(level.price, assetType)}</span>
        </>
      ) : (
        <>
          <span className="text-left text-[#FF4545] font-medium relative z-10 tabular-nums">{formatPrice(level.price, assetType)}</span>
          <span className="text-right text-gray-400 relative z-10 tabular-nums">{formatOrderBookSize(level.size)}</span>
        </>
      )}
    </div>
  );
}, (prev, next) => {
  // Custom equality check - only re-render if data actually changed
  return prev.level.price === next.level.price && 
         prev.level.size === next.level.size &&
         prev.maxSize === next.maxSize;
});

// Memoized side component
const OrderBookSide = memo(function OrderBookSide({
  levels, side, maxSize, assetType, showHeatmap
}: {
  levels: OrderBookLevel[];
  side: 'bid' | 'ask';
  maxSize: number;
  assetType: AssetType;
  showHeatmap: boolean;
}) {
  const isBid = side === 'bid';
  
  return (
    <div className="flex-1 min-w-0">
      <div className={cn(
        "grid grid-cols-2 gap-2 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider border-b border-gray-800",
        isBid ? "text-[#00FF41]" : "text-[#FF4545]"
      )}>
        {isBid ? (
          <><span className="text-left">SIZE</span><span className="text-right">BID</span></>
        ) : (
          <><span className="text-left">ASK</span><span className="text-right">SIZE</span></>
        )}
      </div>
      
      <div className="divide-y divide-gray-900/30">
        {levels.map((level, i) => (
          <OrderBookRow
            key={`${side}-${i}-${level.price}`}
            level={level}
            side={side}
            maxSize={maxSize}
            assetType={assetType}
            showHeatmap={showHeatmap}
            index={i}
          />
        ))}
      </div>
    </div>
  );
});

export function OrderBook({
  orderBook: externalOrderBook, assetType, symbol, maxLevels = 15, showHeatmap = true
}: OrderBookProps) {
  const timestampRef = useRef<HTMLSpanElement>(null);
  const agoRef = useRef<HTMLSpanElement>(null);
  const orderBookTimestampRef = useRef<number>(0);
  
  // Use refs for RAF batching - avoid React state updates on every tick
  const latestOrderBookRef = useRef<OrderBookType | null>(null);
  const hasNewDataRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef(0);
  
  const [displayOrderBook, setDisplayOrderBook] = useState<OrderBookType | null>(null);
  const [stats, setStats] = useState({ updatesPerSecond: 0 });
  const updateCountRef = useRef(0);
  const lastStatsUpdateRef = useRef(Date.now());
  
  // RAF-based render loop - batch updates and render at throttled rate
  const rafCallback = useCallback(() => {
    const now = performance.now();
    
    // Only render if enough time has passed and we have new data
    if (hasNewDataRef.current && now - lastRenderTimeRef.current >= BATCH_RENDER_INTERVAL_MS) {
      const newOB = latestOrderBookRef.current;
      if (newOB) {
        setDisplayOrderBook(newOB);
        hasNewDataRef.current = false;
        lastRenderTimeRef.current = now;
      }
    }
    
    rafIdRef.current = requestAnimationFrame(rafCallback);
  }, []);
  
  // Start RAF loop and data polling
  useEffect(() => {
    if (!symbol) return;
    
    // Start RAF render loop
    rafIdRef.current = requestAnimationFrame(rafCallback);
    
    // Data polling interval - fetch data but don't trigger state updates
    const intervalId = setInterval(() => {
      const { orderBook: newOB, hasNewData, updateCount } = flushOrderBookBuffer(symbol);
      if (!hasNewData || !newOB) return;
      
      // Store in ref - RAF loop will batch render
      latestOrderBookRef.current = newOB;
      hasNewDataRef.current = true;
      updateCountRef.current += updateCount;
      
      // Update stats less frequently
      const now = Date.now();
      if (now - lastStatsUpdateRef.current >= 1000) {
        setStats({ updatesPerSecond: updateCountRef.current });
        updateCountRef.current = 0;
        lastStatsUpdateRef.current = now;
      }
    }, 16); // Poll at 60fps, but render at 30fps
    
    return () => {
      clearInterval(intervalId);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [symbol, rafCallback]);
  
  const orderBook = symbol ? displayOrderBook : externalOrderBook;
  
  useEffect(() => {
    if (orderBook) orderBookTimestampRef.current = orderBook.timestamp;
  }, [orderBook?.timestamp]);
  
  useEffect(() => {
    const unsubscribe = globalClock.subscribe((now) => {
      const ts = orderBookTimestampRef.current;
      if (!ts) return;
      if (timestampRef.current) timestampRef.current.textContent = globalClock.formatTime(ts).full;
      if (agoRef.current) {
        const diff = now - ts;
        const agoText = diff < 1000 ? `${diff}ms` : diff < 60000 ? `${(diff / 1000).toFixed(1)}s` : `${Math.floor(diff / 60000)}m`;
        agoRef.current.textContent = `(${agoText} ago)`;
        agoRef.current.className = diff < 200 ? 'text-green-400 ml-2 text-xs' : diff < 1000 ? 'text-yellow-400 ml-2 text-xs' : 'text-red-400 ml-2 text-xs';
      }
    });
    return unsubscribe;
  }, []);
  
  const { maxBidSize, maxAskSize, bidLevels, askLevels } = useMemo(() => {
    if (!orderBook) return { maxBidSize: 0, maxAskSize: 0, bidLevels: [], askLevels: [] };
    const bids = orderBook.bids.slice(0, maxLevels);
    const asks = orderBook.asks.slice(0, maxLevels);
    return {
      maxBidSize: Math.max(...bids.map(l => l.size), 0),
      maxAskSize: Math.max(...asks.map(l => l.size), 0),
      bidLevels: bids,
      askLevels: asks,
    };
  }, [orderBook, maxLevels]);
  
  const imbalance = useMemo(() => orderBook ? calculateOrderBookImbalance(orderBook) : 0, [orderBook]);
  const midPrice = useMemo(() => orderBook ? getMidPrice(orderBook) : 0, [orderBook]);
  
  const { spread, spreadPercent } = useMemo(() => {
    if (!orderBook || bidLevels.length === 0 || askLevels.length === 0) return { spread: 0, spreadPercent: 0 };
    const bestBid = bidLevels[0].price;
    const bestAsk = askLevels[0].price;
    const s = bestAsk - bestBid;
    return { spread: s, spreadPercent: bestBid > 0 ? (s / bestBid) * 100 : 0 };
  }, [orderBook, bidLevels, askLevels]);
  
  if (!orderBook) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600 bg-black">
        <div className="text-center font-mono">
          <div className="text-3xl mb-2">...</div>
          <p className="text-sm">&gt; Waiting for L2 data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      {symbol && (
        <div className="flex items-center justify-between bg-black px-2 py-1 text-xs text-gray-600 border-b border-gray-800 font-mono">
          <span>{maxLevels} levels</span>
          <span className="text-[#00FF41]">{stats.updatesPerSecond}/sec</span>
        </div>
      )}
      
      <div className="bg-black border-b border-gray-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 font-mono text-xs">
            <div>
              <div className="text-gray-600 uppercase">SPREAD</div>
              <div className="text-sm text-white tabular-nums">
                <span>{Number(spread).toFixed(2).replace(/[.,]00$/, "")}</span>
                <span className="text-gray-600 ml-1">({spreadPercent.toFixed(2)}%)</span>
              </div>
            </div>
            <div className="h-6 w-px bg-gray-800" />
            <div>
              <div className="text-gray-600 uppercase">MID</div>
              <div className="text-sm text-white tabular-nums">{formatPrice(midPrice, assetType)}</div>
            </div>
            <div className="h-6 w-px bg-gray-800" />
            <div>
              <div className="text-gray-600 uppercase">UPDATED</div>
              <div className="text-sm text-[#00FF41] flex items-baseline tabular-nums">
                <span ref={timestampRef}>--:--:--.---</span>
                <span ref={agoRef} className="text-[#00FF41] ml-1 text-xs">(0ms)</span>
              </div>
            </div>
          </div>
          
          <div className="ml-3 pl-3 border-l border-gray-800 font-mono" style={{ width: '90px', minWidth: '90px' }}>
            <div className="text-xs text-gray-600 uppercase">IMB</div>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1.5 bg-gray-900 rounded-full overflow-hidden flex">
                <div style={{ 
                  width: `${Math.min(Math.max(50 + imbalance / 2, 5), 95)}%`,
                  backgroundColor: imbalance > 0 ? '#00FF41' : imbalance < 0 ? '#FF4545' : '#333'
                }} />
              </div>
              <span className={cn("text-xs font-bold tabular-nums",
                imbalance > 0 ? 'text-[#00FF41]' : imbalance < 0 ? 'text-[#FF4545]' : 'text-gray-600'
              )}>{imbalance >= 0 ? '+' : ''}{imbalance.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden bg-black">
        <OrderBookSide levels={bidLevels} side="bid" maxSize={maxBidSize} assetType={assetType} showHeatmap={showHeatmap} />
        <div className="w-px bg-gray-800" />
        <OrderBookSide levels={askLevels} side="ask" maxSize={maxAskSize} assetType={assetType} showHeatmap={showHeatmap} />
      </div>
    </div>
  );
}
