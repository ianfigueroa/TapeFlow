import { useRef, useEffect, useCallback, useState } from 'react';
import { CanvasEngine, type CanvasEngineHandle, LAYER_Z } from '../engine';
import { BackgroundLayer, FootprintLayer } from '../engine/layers';
import { subscribeToTrades } from '../services/dataBuffer';
import type { TradeWithAnalytics, Trade } from '../types';

// Convert basic Trade to TradeWithAnalytics with minimal defaults
function toTradeWithAnalytics(trade: Trade): TradeWithAnalytics {
  return {
    ...trade,
    vwap: trade.price,
    vwapDrift: 0,
    delta: trade.side === 'buy' ? trade.volume : -trade.volume,
    relativeStrength: 0,
    momentum: 0,
    spreadAtPrint: 0,
  };
}

interface FootprintChartProps {
  trades?: TradeWithAnalytics[];  // Optional - will subscribe to buffer if not provided
  symbol: string;
  clusterIntervalMs?: number;
  tickSize?: number;
  className?: string;
}

export function FootprintChart({
  trades: externalTrades,
  symbol,
  clusterIntervalMs = 60000,
  tickSize,
  className,
}: FootprintChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngineHandle | null>(null);
  const footprintLayerRef = useRef<FootprintLayer | null>(null);
  const lastSymbolRef = useRef<string>(symbol);
  const [isReady, setIsReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 400, height: 200 });
  const pendingTradesRef = useRef<Trade[]>([]);

  // ResizeObserver to fill container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleReady = useCallback((handle: CanvasEngineHandle) => {
    engineRef.current = handle;

    const background = new BackgroundLayer();
    const footprint = new FootprintLayer();

    footprint.setClusterInterval(clusterIntervalMs);
    if (tickSize) footprint.setTickSize(tickSize);

    handle.registerLayer('background', background, LAYER_Z.BACKGROUND);
    handle.registerLayer('footprint', footprint, LAYER_Z.FOOTPRINT);

    footprintLayerRef.current = footprint;
    setIsReady(true);
  }, [clusterIntervalMs, tickSize]);

  // Update layer settings when props change
  useEffect(() => {
    const layer = footprintLayerRef.current;
    if (!layer) return;

    layer.setClusterInterval(clusterIntervalMs);
    if (tickSize) layer.setTickSize(tickSize);
  }, [clusterIntervalMs, tickSize]);

  // Handle symbol change - Reset everything properly
  useEffect(() => {
    const layer = footprintLayerRef.current;
    if (!layer) return;
    
    if (lastSymbolRef.current !== symbol) {
      console.log(`[FootprintChart] Symbol changed: ${lastSymbolRef.current} -> ${symbol}`);
      layer.clear();
      pendingTradesRef.current = [];
      lastSymbolRef.current = symbol;
    }
  }, [symbol]);

  // Subscribe to live trade stream using the listener pattern
  // This doesn't consume the buffer - it receives a copy of each trade
  useEffect(() => {
    if (!symbol) return;
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      // Only process trades for our symbol
      if (trade.symbol.toUpperCase() !== symbol.toUpperCase()) return;
      
      pendingTradesRef.current.push(trade);
    });

    return unsubscribe;
  }, [symbol]);

  // Process pending trades at regular intervals
  useEffect(() => {
    if (!isReady) return;
    
    const engine = engineRef.current;
    if (!engine) return;

    const intervalId = setInterval(() => {
      if (pendingTradesRef.current.length === 0) return;
      
      const tradesToProcess = pendingTradesRef.current;
      pendingTradesRef.current = [];

      engine.updateData({
        trades: tradesToProcess.map(toTradeWithAnalytics),
        orderBook: null,
        vwap: 0,
        cvd: 0,
        liquidityZones: [],
      });
    }, 100); // 10fps is enough for footprint aggregation

    return () => clearInterval(intervalId);
  }, [isReady]);

  // Also process external trades if provided (for backwards compatibility)
  const lastTradeIndexRef = useRef(0);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isReady || !externalTrades || externalTrades.length === 0) return;
    
    // Safety check: ensure we're processing trades for the current symbol
    if (externalTrades[0].symbol !== symbol) return;

    // Get only new trades
    const newTrades = externalTrades.slice(lastTradeIndexRef.current);
    if (newTrades.length === 0) return;

    engine.updateData({
      trades: newTrades,
      orderBook: null,
      vwap: 0,
      cvd: 0,
      liquidityZones: [],
    });
    
    lastTradeIndexRef.current = externalTrades.length;
  }, [externalTrades, isReady, symbol]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`} style={{ minHeight: 100 }}>
      <CanvasEngine
        width={dimensions.width}
        height={dimensions.height}
        onReady={handleReady}
      />
    </div>
  );
}
