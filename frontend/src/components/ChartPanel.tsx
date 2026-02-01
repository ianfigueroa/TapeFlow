// Combined visualization panel with candlestick/price charts and volume
// Note: Delta/CVD chart has been consolidated to CVDOverlay component

import { useMemo, useState, useEffect, useRef } from 'react';
import { PriceChart, type PriceDataPoint } from './PriceChart';
import { CandlestickChart, type CandleDataPoint } from './CandlestickChart';
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

// Build OHLC candles from trades
function buildCandles(
  trades: TradeWithAnalytics[],
  intervalMs: number = 15000 // 15-second candles
): CandleDataPoint[] {
  if (trades.length === 0) return [];

  const candles: CandleDataPoint[] = [];
  let currentCandle: CandleDataPoint | null = null;

  for (const trade of trades) {
    const candleStart = Math.floor(trade.timestamp / intervalMs) * intervalMs;

    if (!currentCandle || currentCandle.timestamp !== candleStart) {
      // Close previous candle and start new one
      if (currentCandle) {
        candles.push(currentCandle);
      }
      currentCandle = {
        timestamp: candleStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
        vwap: trade.vwap,
      };
    } else {
      // Update current candle
      currentCandle.high = Math.max(currentCandle.high, trade.price);
      currentCandle.low = Math.min(currentCandle.low, trade.price);
      currentCandle.close = trade.price;
      currentCandle.volume += trade.volume;
      currentCandle.vwap = trade.vwap; // Use latest VWAP
    }
  }

  // Push the final in-progress candle
  if (currentCandle) {
    candles.push(currentCandle);
  }

  // Keep only last 50 candles for display
  return candles.slice(-50);
}

export function ChartPanel({ trades: externalTrades, symbol, width = 600, className = '', compact: _compact = false }: ChartPanelProps) {
  const visualization = useSettingsStore((state) => state.visualization);
  const [bufferTrades, setBufferTrades] = useState<TradeWithAnalytics[]>([]);
  const candleHistoryRef = useRef<CandleDataPoint[]>([]);

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

  // Build candlestick data from trades
  const candleData = useMemo(() => {
    if (trades.length === 0) return candleHistoryRef.current;
    
    const candles = buildCandles(trades, 15000); // 15-second candles
    candleHistoryRef.current = candles;
    return candles;
  }, [trades]);

  // Also keep legacy price data for fallback/transition
  const priceData = useMemo(() => {
    if (trades.length === 0) return [];
    const recentTrades = trades.slice(-200);
    const bucketSize = Math.max(1, Math.floor(recentTrades.length / 50));
    const pricePoints: PriceDataPoint[] = [];
    let cumulativeDelta = 0;

    for (let i = 0; i < recentTrades.length; i += bucketSize) {
      const bucket = recentTrades.slice(i, i + bucketSize);
      if (bucket.length === 0) continue;
      const lastTrade = bucket[bucket.length - 1];
      const avgPrice = bucket.reduce((sum, t) => sum + t.price, 0) / bucket.length;
      const totalVolume = bucket.reduce((sum, t) => sum + t.volume, 0);
      const avgVwap = bucket.reduce((sum, t) => sum + t.vwap, 0) / bucket.length;
      bucket.forEach((trade) => {
        cumulativeDelta += trade.side === 'buy' ? trade.volume : -trade.volume;
      });
      pricePoints.push({
        timestamp: lastTrade.timestamp,
        price: avgPrice,
        volume: totalVolume,
        vwap: avgVwap || avgPrice,
        delta: cumulativeDelta,
      });
    }
    return pricePoints;
  }, [trades]);

  // CVD chart removed - consolidated to CVDOverlay component
  const showAnyChart = visualization.showPriceChart || visualization.showVolumeChart || visualization.showFootprint;

  if (!showAnyChart) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {(visualization.showPriceChart || visualization.showVolumeChart) && (
        <div className="bg-black rounded border border-gray-800 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-500 uppercase">
              Candlestick {visualization.showVolumeChart && '/ Volume'}
              {visualization.showVwapLine && ' / VWAP'}
            </span>
            <span className="text-[10px] font-mono text-gray-600">15s candles</span>
          </div>
          {candleData.length > 0 ? (
            <CandlestickChart
              data={candleData}
              width={width - 16}
              height={visualization.chartHeight}
              showVolume={visualization.showVolumeChart}
              showVwap={visualization.showVwapLine}
            />
          ) : (
            <PriceChart
              data={priceData}
              width={width - 16}
              height={visualization.chartHeight}
              showVolume={visualization.showVolumeChart}
              showVwap={visualization.showVwapLine}
            />
          )}
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
