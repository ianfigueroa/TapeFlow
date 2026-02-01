// Combined visualization panel with price, volume, and delta charts

import { useMemo, useState, useEffect } from 'react';
import { PriceChart, type PriceDataPoint } from './PriceChart';
import { DeltaChart, type DeltaDataPoint } from './DeltaChart';
import { FootprintChart } from './FootprintChart';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getDisplayTrades } from '../services/dataBuffer';
import type { TradeWithAnalytics } from '../types';

interface ChartPanelProps {
  trades: TradeWithAnalytics[];
  symbol?: string;
  width?: number;
  className?: string;
  compact?: boolean;
}

export function ChartPanel({ trades: externalTrades, symbol, width = 600, className = '', compact = false }: ChartPanelProps) {
  const visualization = useSettingsStore((state) => state.visualization);
  const [bufferTrades, setBufferTrades] = useState<TradeWithAnalytics[]>([]);

  // Poll the buffer for chart data at 10fps (charts don't need 60fps)
  useEffect(() => {
    if (!symbol) return;
    
    const intervalId = setInterval(() => {
      const processed = getDisplayTrades(symbol);
      if (processed.length > 0) {
        setBufferTrades(processed);
      }
    }, 100); // 10fps for charts is plenty
    
    return () => clearInterval(intervalId);
  }, [symbol]);

  // Use buffer trades if available (from TapeTable's processing), otherwise use external
  const trades = symbol && bufferTrades.length > 0 ? bufferTrades : externalTrades;

  // Convert trades to chart data points
  // Aggregate by time buckets for smoother charts
  const { priceData, deltaData } = useMemo(() => {
    if (trades.length === 0) {
      return { priceData: [], deltaData: [] };
    }

    // Take last 200 trades for chart display
    const recentTrades = trades.slice(-200);
    
    // Aggregate into time buckets (every 10 trades)
    const bucketSize = Math.max(1, Math.floor(recentTrades.length / 50));
    const pricePoints: PriceDataPoint[] = [];
    const deltaPoints: DeltaDataPoint[] = [];

    let cumulativeDelta = 0;
    let cumulativeBuyVol = 0;
    let cumulativeSellVol = 0;

    for (let i = 0; i < recentTrades.length; i += bucketSize) {
      const bucket = recentTrades.slice(i, i + bucketSize);
      if (bucket.length === 0) continue;

      const lastTrade = bucket[bucket.length - 1];
      const avgPrice = bucket.reduce((sum, t) => sum + t.price, 0) / bucket.length;
      const totalVolume = bucket.reduce((sum, t) => sum + t.volume, 0);
      const avgVwap = bucket.reduce((sum, t) => sum + t.vwap, 0) / bucket.length;

      // Calculate delta for this bucket
      bucket.forEach((trade) => {
        if (trade.side === 'buy') {
          cumulativeBuyVol += trade.volume;
          cumulativeDelta += trade.volume;
        } else if (trade.side === 'sell') {
          cumulativeSellVol += trade.volume;
          cumulativeDelta -= trade.volume;
        }
      });

      pricePoints.push({
        timestamp: lastTrade.timestamp,
        price: avgPrice,
        volume: totalVolume,
        vwap: avgVwap || avgPrice,
        delta: cumulativeDelta,
      });

      deltaPoints.push({
        timestamp: lastTrade.timestamp,
        delta: cumulativeDelta,
        buyVolume: cumulativeBuyVol,
        sellVolume: cumulativeSellVol,
      });
    }

    return { priceData: pricePoints, deltaData: deltaPoints };
  }, [trades]);

  const showAnyChart = visualization.showPriceChart || visualization.showVolumeChart || visualization.showDeltaChart || visualization.showFootprint;

  if (!showAnyChart) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {(visualization.showPriceChart || visualization.showVolumeChart) && (
        <div className="bg-black rounded border border-gray-800 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-500 uppercase">
              Price {visualization.showVolumeChart && '/ Volume'}
              {visualization.showVwapLine && ' / VWAP'}
            </span>
          </div>
          <PriceChart
            data={priceData}
            width={width - 16}
            height={visualization.chartHeight}
            showVolume={visualization.showVolumeChart}
            showVwap={visualization.showVwapLine}
          />
        </div>
      )}

      {visualization.showDeltaChart && (
        <div className="bg-black rounded border border-gray-800 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-500 uppercase">
              Cumulative Delta (Order Flow)
            </span>
          </div>
          <DeltaChart
            data={deltaData}
            width={width - 16}
            height={Math.floor(visualization.chartHeight * 0.75)}
          />
        </div>
      )}

      {visualization.showFootprint && (
        <div className="bg-black rounded border border-gray-800 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-500 uppercase">
              Footprint (Bid x Ask)
            </span>
          </div>
          <FootprintChart
            trades={trades}
            symbol={symbol || ''}
            width={width - 16}
            height={visualization.chartHeight}
            clusterIntervalMs={60000}
          />
        </div>
      )}
    </div>
  );
}
