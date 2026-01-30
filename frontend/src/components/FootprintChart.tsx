import { useRef, useEffect, useCallback } from 'react';
import { CanvasEngine, type CanvasEngineHandle, LAYER_Z } from '../engine';
import { BackgroundLayer, FootprintLayer } from '../engine/layers';
import type { TradeWithAnalytics } from '../types';

interface FootprintChartProps {
  trades: TradeWithAnalytics[];
  symbol: string;
  width: number;
  height: number;
  clusterIntervalMs?: number;
  tickSize?: number;
  className?: string;
}

export function FootprintChart({
  trades,
  symbol,
  width,
  height,
  clusterIntervalMs = 60000,
  tickSize,
  className,
}: FootprintChartProps) {
  const engineRef = useRef<CanvasEngineHandle | null>(null);
  const footprintLayerRef = useRef<FootprintLayer | null>(null);
  const lastTradeIndexRef = useRef(0);

  const handleReady = useCallback((handle: CanvasEngineHandle) => {
    engineRef.current = handle;

    const background = new BackgroundLayer();
    const footprint = new FootprintLayer();

    footprint.setClusterInterval(clusterIntervalMs);
    if (tickSize) footprint.setTickSize(tickSize);

    handle.registerLayer('background', background, LAYER_Z.BACKGROUND);
    handle.registerLayer('footprint', footprint, LAYER_Z.FOOTPRINT);

    footprintLayerRef.current = footprint;
  }, [clusterIntervalMs, tickSize]);

  useEffect(() => {
    const layer = footprintLayerRef.current;
    if (!layer) return;

    layer.setClusterInterval(clusterIntervalMs);
    if (tickSize) layer.setTickSize(tickSize);
  }, [clusterIntervalMs, tickSize]);

  useEffect(() => {
    const layer = footprintLayerRef.current;
    if (!layer) return;

    layer.clear();
    lastTradeIndexRef.current = 0;
  }, [symbol]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || trades.length === 0) return;

    const newTrades = trades.slice(lastTradeIndexRef.current);
    if (newTrades.length === 0) return;

    engine.updateData({
      trades: newTrades,
      orderBook: null,
      vwap: 0,
      cvd: 0,
      liquidityZones: [],
    });
    lastTradeIndexRef.current = trades.length;
  }, [trades]);

  return (
    <CanvasEngine
      width={width}
      height={height}
      onReady={handleReady}
      className={className}
    />
  );
}
