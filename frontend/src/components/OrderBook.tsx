// Level 2 order book with heatmap visualization
// Optimized with requestAnimationFrame batching for high-frequency updates
// Uses REST snapshot + WebSocket buffering pattern to prevent "Waiting for data..." state

import { useMemo, useEffect, useRef, useState, useCallback, memo } from 'react';
import { cn } from '../lib/utils';
import { formatPrice, formatOrderBookSize } from '../utils/formatters';
import type { OrderBook as OrderBookType, OrderBookLevel, AssetType } from '../types';
import { calculateOrderBookImbalance, getMidPrice } from '../utils/calculations';
import { globalClock } from '../services/globalClock';
import { flushOrderBookBuffer, pushOrderBook, getCurrentOrderBook } from '../services/dataBuffer';

// RAF-based render batching
const BATCH_RENDER_INTERVAL_MS = 33; // ~30fps for order book (sufficient for human perception)
const DATA_POLL_INTERVAL_MS = 33; // Match poll rate to render rate to prevent visual jumps

// Rolling window for smoothed maxSize calculation (prevents heatmap flickering)
const MAX_SIZE_HISTORY_LENGTH = 10;

// Binance API for initial snapshot
const BINANCE_SPOT_API = 'https://api.binance.com/api/v3';
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

// Hydration states
type HydrationState = 'idle' | 'fetching-snapshot' | 'buffering' | 'live';

/**
 * Fetch initial order book snapshot from REST API
 * This provides immediate data while WebSocket connects
 */
async function fetchOrderBookSnapshot(
  symbol: string,
  assetType: AssetType = 'crypto',
  limit: number = 20
): Promise<OrderBookType | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase().replace('/', '').replace('-', '');
    
    // Detect if futures based on symbol naming
    const isFutures = normalizedSymbol.includes('PERP') || 
                       normalizedSymbol.endsWith('USD') ||
                       !normalizedSymbol.endsWith('USDT') && normalizedSymbol.length > 6;
    
    const baseUrl = isFutures ? BINANCE_FUTURES_API : BINANCE_SPOT_API;
    const endpoint = `${baseUrl}/depth?symbol=${normalizedSymbol}&limit=${limit}`;
    
    const response = await fetch(endpoint);
    if (!response.ok) {
      // Fallback to spot if futures fails
      if (isFutures) {
        const spotResponse = await fetch(`${BINANCE_SPOT_API}/depth?symbol=${normalizedSymbol}&limit=${limit}`);
        if (spotResponse.ok) {
          const data = await spotResponse.json();
          return transformBinanceOrderBook(data, symbol, assetType);
        }
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return transformBinanceOrderBook(data, symbol, assetType);
  } catch (error) {
    console.warn('[OrderBook] Failed to fetch snapshot:', error);
    return null;
  }
}

/**
 * Transform Binance API response to our OrderBook type
 */
function transformBinanceOrderBook(
  data: { bids: [string, string][]; asks: [string, string][]; lastUpdateId?: number },
  symbol: string,
  assetType: AssetType
): OrderBookType {
  const bids = data.bids.map(([price, size]) => ({
    price: parseFloat(price),
    size: parseFloat(size),
  }));
  const asks = data.asks.map(([price, size]) => ({
    price: parseFloat(price),
    size: parseFloat(size),
  }));
  
  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;
  
  return {
    symbol: symbol.toUpperCase(),
    assetType,
    timestamp: Date.now(),
    bids,
    asks,
    spread,
    spreadPercent,
    lastUpdateId: data.lastUpdateId,
  };
}

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
    <div className="relative grid grid-cols-2 gap-0.5 px-0.5 py-0.5 text-[10px] font-mono hover:bg-gray-900/50 overflow-hidden">
      {showHeatmap && <HeatmapBar intensity={intensity} side={side} />}
      {isBid ? (
        <>
          <span className="text-left text-gray-400 relative z-10 tabular-nums truncate">{formatOrderBookSize(level.size)}</span>
          <span className="text-right text-[#00FF41] font-medium relative z-10 tabular-nums truncate">{formatPrice(level.price, assetType)}</span>
        </>
      ) : (
        <>
          <span className="text-left text-[#FF4545] font-medium relative z-10 tabular-nums truncate">{formatPrice(level.price, assetType)}</span>
          <span className="text-right text-gray-400 relative z-10 tabular-nums truncate">{formatOrderBookSize(level.size)}</span>
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
    <div className="flex-1 min-w-0 overflow-hidden">
      <div className={cn(
        "grid grid-cols-2 gap-0.5 px-0.5 py-1 text-[9px] font-mono uppercase tracking-wider border-b border-gray-800",
        isBid ? "text-[#00FF41]" : "text-[#FF4545]"
      )}>
        {isBid ? (
          <><span className="text-left truncate">SIZE</span><span className="text-right truncate">BID</span></>
        ) : (
          <><span className="text-left truncate">ASK</span><span className="text-right truncate">SIZE</span></>
        )}
      </div>
      
      <div className="divide-y divide-gray-900/30">
        {levels.map((level) => (
          <OrderBookRow
            key={`${side}-${level.price.toFixed(8)}`}
            level={level}
            side={side}
            maxSize={maxSize}
            assetType={assetType}
            showHeatmap={showHeatmap}
            index={0}
          />
        ))}
      </div>
    </div>
  );
});

// Tick size options by asset category
const TICK_SIZES: Record<string, number[]> = {
  BTC: [0.1, 0.5, 1, 5, 10, 25, 50, 100],
  ETH: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  HIGH: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5], // $10-$1000
  MID: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05], // $0.10-$10
  LOW: [0.00001, 0.00005, 0.0001, 0.0005, 0.001], // <$0.10
};

function getTickSizeOptions(symbol: string, price: number): number[] {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return TICK_SIZES.BTC;
  if (sym.includes('ETH')) return TICK_SIZES.ETH;
  if (price >= 10) return TICK_SIZES.HIGH;
  if (price >= 0.1) return TICK_SIZES.MID;
  return TICK_SIZES.LOW;
}

// Aggregate order book levels by tick size
function aggregateLevelsByTick(
  levels: OrderBookLevel[],
  tickSize: number,
  side: 'bid' | 'ask'
): OrderBookLevel[] {
  if (!levels.length || tickSize <= 0) return levels;
  
  const aggregated = new Map<number, number>();
  
  for (const level of levels) {
    // Round to tick size (floor for bids, ceil for asks to maintain proper ordering)
    const roundedPrice = side === 'bid'
      ? Math.floor(level.price / tickSize) * tickSize
      : Math.ceil(level.price / tickSize) * tickSize;
    
    aggregated.set(roundedPrice, (aggregated.get(roundedPrice) || 0) + level.size);
  }
  
  const result = Array.from(aggregated.entries())
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
  
  return result;
}

export function OrderBook({
  orderBook: externalOrderBook, assetType, symbol, maxLevels = 15, showHeatmap = true
}: OrderBookProps) {
  const timestampRef = useRef<HTMLSpanElement>(null);
  const agoRef = useRef<HTMLSpanElement>(null);
  const orderBookTimestampRef = useRef<number>(0);
  
  // Tick size state
  const [tickSize, setTickSize] = useState<number>(0); // 0 = auto/no aggregation
  const [tickSizeOptions, setTickSizeOptions] = useState<number[]>([]);
  
  // Use refs for RAF batching - avoid React state updates on every tick
  const latestOrderBookRef = useRef<OrderBookType | null>(null);
  const hasNewDataRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef(0);
  
  // Rolling window for smoothed maxSize (prevents heatmap bar flickering)
  const maxBidSizeHistoryRef = useRef<number[]>([]);
  const maxAskSizeHistoryRef = useRef<number[]>([]);
  
  const [displayOrderBook, setDisplayOrderBook] = useState<OrderBookType | null>(null);
  const [stats, setStats] = useState({ updatesPerSecond: 0 });
  const updateCountRef = useRef(0);
  const lastStatsUpdateRef = useRef(Date.now());
  
  // === HYDRATION STATE MANAGEMENT ===
  // States: idle -> fetching-snapshot -> buffering -> live
  const [hydrationState, setHydrationState] = useState<HydrationState>('idle');
  const wsBufferRef = useRef<OrderBookType[]>([]); // Buffer WS updates while fetching snapshot
  const snapshotFetchedRef = useRef(false);
  const lastSymbolRef = useRef<string>('');
  
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
  
  // Reset tick size options when symbol changes
  useEffect(() => {
    if (!symbol) return;
    
    // Estimate price from current order book or default
    const estimatedPrice = latestOrderBookRef.current?.bids?.[0]?.price || 
                          displayOrderBook?.bids?.[0]?.price || 
                          externalOrderBook?.bids?.[0]?.price || 50000;
    
    const options = getTickSizeOptions(symbol, estimatedPrice);
    setTickSizeOptions(options);
    
    // Reset to auto (0) when symbol changes
    setTickSize(0);
  }, [symbol]);
  
  // === SNAPSHOT HYDRATION EFFECT ===
  // Fetch REST snapshot on mount/symbol change, then apply buffered WS updates
  useEffect(() => {
    if (!symbol) return;
    
    // Reset on symbol change
    if (symbol !== lastSymbolRef.current) {
      lastSymbolRef.current = symbol;
      snapshotFetchedRef.current = false;
      wsBufferRef.current = [];
      setHydrationState('fetching-snapshot');
      setDisplayOrderBook(null);
      latestOrderBookRef.current = null;
    }
    
    // Already fetched for this symbol
    if (snapshotFetchedRef.current) return;
    
    let cancelled = false;
    
    const hydrateOrderBook = async () => {
      setHydrationState('fetching-snapshot');
      
      // First, check if we already have data in the buffer from WebSocket
      const existingData = getCurrentOrderBook(symbol);
      if (existingData && existingData.bids.length > 0) {
        // Already have WS data, use it directly
        latestOrderBookRef.current = existingData;
        hasNewDataRef.current = true;
        snapshotFetchedRef.current = true;
        setHydrationState('live');
        return;
      }
      
      // Fetch REST snapshot
      const snapshot = await fetchOrderBookSnapshot(symbol, assetType, maxLevels * 2);
      
      if (cancelled) return;
      
      if (snapshot) {
        // Push snapshot to buffer so other components can use it
        pushOrderBook(snapshot);
        
        // Apply snapshot
        latestOrderBookRef.current = snapshot;
        hasNewDataRef.current = true;
        snapshotFetchedRef.current = true;
        
        // Now apply any buffered WS updates
        setHydrationState('buffering');
        
        // Apply buffered updates in order
        for (const bufferedOB of wsBufferRef.current) {
          // Merge buffered update with current state
          latestOrderBookRef.current = bufferedOB;
          hasNewDataRef.current = true;
        }
        wsBufferRef.current = [];
        
        setHydrationState('live');
      } else {
        // Snapshot failed, try again in 2 seconds or wait for WS
        setTimeout(() => {
          if (!cancelled && !snapshotFetchedRef.current) {
            hydrateOrderBook();
          }
        }, 2000);
      }
    };
    
    hydrateOrderBook();
    
    return () => {
      cancelled = true;
    };
  }, [symbol, assetType, maxLevels]);
  
  // Start RAF loop and data polling
  useEffect(() => {
    if (!symbol) return;
    
    // Start RAF render loop
    rafIdRef.current = requestAnimationFrame(rafCallback);
    
    // Data polling interval - fetch data but don't trigger state updates
    const intervalId = setInterval(() => {
      const { orderBook: newOB, hasNewData, updateCount } = flushOrderBookBuffer(symbol);
      if (!hasNewData || !newOB) return;
      
      // If still fetching snapshot, buffer the WS updates
      if (!snapshotFetchedRef.current) {
        wsBufferRef.current.push(newOB);
        // Limit buffer size
        if (wsBufferRef.current.length > 100) {
          wsBufferRef.current.shift();
        }
        return;
      }
      
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
    }, DATA_POLL_INTERVAL_MS); // Match poll rate to render rate
    
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
    
    // Apply tick size aggregation if set (tickSize > 0)
    let bids = tickSize > 0 
      ? aggregateLevelsByTick(orderBook.bids, tickSize, 'bid').slice(0, maxLevels)
      : orderBook.bids.slice(0, maxLevels);
    let asks = tickSize > 0
      ? aggregateLevelsByTick(orderBook.asks, tickSize, 'ask').slice(0, maxLevels)
      : orderBook.asks.slice(0, maxLevels);
    
    // Calculate current max sizes
    const currentMaxBid = Math.max(...bids.map(l => l.size), 0);
    const currentMaxAsk = Math.max(...asks.map(l => l.size), 0);
    
    // Add to rolling window history
    maxBidSizeHistoryRef.current.push(currentMaxBid);
    maxAskSizeHistoryRef.current.push(currentMaxAsk);
    
    // Keep only last N values
    if (maxBidSizeHistoryRef.current.length > MAX_SIZE_HISTORY_LENGTH) {
      maxBidSizeHistoryRef.current.shift();
    }
    if (maxAskSizeHistoryRef.current.length > MAX_SIZE_HISTORY_LENGTH) {
      maxAskSizeHistoryRef.current.shift();
    }
    
    // Use smoothed max (rolling average of peaks) for stable heatmap
    const smoothedMaxBid = maxBidSizeHistoryRef.current.length > 0
      ? maxBidSizeHistoryRef.current.reduce((a, b) => Math.max(a, b), 0) * 0.9 + 
        (maxBidSizeHistoryRef.current.reduce((a, b) => a + b, 0) / maxBidSizeHistoryRef.current.length) * 0.1
      : currentMaxBid;
    const smoothedMaxAsk = maxAskSizeHistoryRef.current.length > 0
      ? maxAskSizeHistoryRef.current.reduce((a, b) => Math.max(a, b), 0) * 0.9 + 
        (maxAskSizeHistoryRef.current.reduce((a, b) => a + b, 0) / maxAskSizeHistoryRef.current.length) * 0.1
      : currentMaxAsk;
    
    return {
      maxBidSize: smoothedMaxBid,
      maxAskSize: smoothedMaxAsk,
      bidLevels: bids,
      askLevels: asks,
    };
  }, [orderBook, maxLevels, tickSize]);
  
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
    // Show hydration state
    const statusMessages: Record<HydrationState, { icon: string; text: string }> = {
      'idle': { icon: '○', text: 'Initializing...' },
      'fetching-snapshot': { icon: '◐', text: 'Loading snapshot...' },
      'buffering': { icon: '◑', text: 'Syncing updates...' },
      'live': { icon: '●', text: 'Connecting...' },
    };
    const status = statusMessages[hydrationState];
    
    return (
      <div className="flex items-center justify-center h-64 text-gray-600 bg-black">
        <div className="text-center font-mono">
          <div className="text-2xl mb-2 animate-pulse">{status.icon}</div>
          <p className="text-sm text-[#00FF41]">&gt; {status.text}</p>
          {symbol && <p className="text-xs text-gray-700 mt-1">{symbol.toUpperCase()}</p>}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      {symbol && (
        <div className="flex items-center justify-between bg-black px-2 py-1 text-xs text-gray-600 border-b border-gray-800 font-mono">
          <div className="flex items-center gap-3">
            <span>{maxLevels} levels</span>
            {/* Tick Size Selector */}
            <div className="flex items-center gap-1">
              <span className="text-gray-600">Tick:</span>
              <select
                value={tickSize}
                onChange={(e) => setTickSize(Number(e.target.value))}
                className="bg-gray-900 border border-gray-700 text-[#00FF41] text-xs px-1 py-0.5 rounded cursor-pointer hover:border-[#00FF41] transition-colors"
              >
                <option value={0}>Auto</option>
                {tickSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size >= 1 ? size.toFixed(0) : size.toPrecision(2)}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
