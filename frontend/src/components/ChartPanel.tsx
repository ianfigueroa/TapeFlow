// Combined visualization panel with candlestick/price charts and volume
// Note: FootprintChart has been moved to dedicated panel in TradingDashboard
// Note: Delta/CVD chart has been consolidated to CVDOverlay component

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { PriceChart, type PriceDataPoint } from './PriceChart';
import { CandlestickChart, type CandleDataPoint } from './CandlestickChart';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getChartTrades } from '../services/dataBuffer';
import { Tooltip } from './Tooltip';
import { cn } from '../lib/utils';
import type { TradeWithAnalytics } from '../types';

// Time interval options
const TIME_INTERVALS = [
  { label: '15s', value: 15000, display: '15 SEC' },
  { label: '1m', value: 60000, display: '1 MIN' },
  { label: '5m', value: 300000, display: '5 MIN' },
  { label: '15m', value: 900000, display: '15 MIN' },
  { label: '1H', value: 3600000, display: '1 HOUR' },
  { label: '4H', value: 14400000, display: '4 HOUR' },
] as const;

type TimeInterval = typeof TIME_INTERVALS[number];

// Chart view types
type ChartView = 'candlestick' | 'heikin-ashi' | 'line';

// Auto-scale icon
const AutoScaleIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
  </svg>
);

// Zoom icons
const ZoomInIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
  </svg>
);

interface ChartPanelProps {
  trades: TradeWithAnalytics[];
  symbol?: string;
  width?: number;
  className?: string;
  compact?: boolean;
}

// Convert regular candles to Heikin-Ashi
function toHeikinAshi(candles: CandleDataPoint[]): CandleDataPoint[] {
  if (candles.length === 0) return [];
  
  const result: CandleDataPoint[] = [];
  let prevHA: CandleDataPoint | null = null;
  
  for (const candle of candles) {
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
    const haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : (candle.open + candle.close) / 2;
    const haHigh = Math.max(candle.high, haOpen, haClose);
    const haLow = Math.min(candle.low, haOpen, haClose);
    
    const ha: CandleDataPoint = {
      timestamp: candle.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: candle.volume,
      vwap: candle.vwap,
    };
    
    result.push(ha);
    prevHA = ha;
  }
  
  return result;
}

// Build OHLC candles from trades
// NOTE: Trades can be in either order (newest-first or oldest-first)
// We need to handle both cases and ensure candles are built correctly
function buildCandles(
  trades: TradeWithAnalytics[],
  intervalMs: number = 15000 // Default 15-second candles
): CandleDataPoint[] {
  if (trades.length === 0) return [];

  // Sort trades by timestamp (oldest first) for proper OHLC calculation
  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  
  const candleMap = new Map<number, CandleDataPoint>();

  for (const trade of sortedTrades) {
    const candleStart = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    
    let candle = candleMap.get(candleStart);
    
    if (!candle) {
      // Create new candle
      candle = {
        timestamp: candleStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
        vwap: trade.vwap,
      };
      candleMap.set(candleStart, candle);
    } else {
      // Update existing candle
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price; // Last trade in the interval is the close
      candle.volume += trade.volume;
      candle.vwap = trade.vwap; // Use latest VWAP
    }
  }

  // Convert map to array and sort by timestamp
  const candles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  // Return all candles - zoom/slice happens at render time
  return candles;
}

export function ChartPanel({ trades: externalTrades, symbol, width = 600, className = '', compact: _compact = false }: ChartPanelProps) {
  const visualization = useSettingsStore((state) => state.visualization);
  const [bufferTrades, setBufferTrades] = useState<TradeWithAnalytics[]>([]);
  const [autoScaleKey, setAutoScaleKey] = useState(0);
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(TIME_INTERVALS[0]); // Default 15s
  const [chartView, setChartView] = useState<ChartView>('candlestick');
  const [visibleCandles, setVisibleCandles] = useState(100); // Zoom level
  const candleHistoryRef = useRef<CandleDataPoint[]>([]);
  
  // Auto-scale handler - forces a re-render with fresh bounds
  const handleAutoScale = useCallback(() => {
    setAutoScaleKey(k => k + 1);
  }, []);
  
  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setVisibleCandles(v => Math.max(20, v - 20));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setVisibleCandles(v => Math.min(500, v + 20)); // Allow zooming out to 500 candles
  }, []);
  
  // Mouse wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // Scroll up = zoom in (show fewer candles)
      setVisibleCandles(v => Math.max(20, v - 10));
    } else {
      // Scroll down = zoom out (show more candles)
      setVisibleCandles(v => Math.min(500, v + 10));
    }
  }, []);

  // Poll the buffer for chart data at 10fps (charts don't need 60fps)
  useEffect(() => {
    if (!symbol) return;
    
    const intervalId = setInterval(() => {
      // Use getChartTrades for more historical data (2000 trades vs 100)
      const processed = getChartTrades(symbol);
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
    
    // Build ALL candles from available trades (don't limit here)
    const rawCandles = buildCandles(trades, selectedInterval.value);
    
    // Apply Heikin-Ashi transformation if selected
    const allCandles = chartView === 'heikin-ashi' ? toHeikinAshi(rawCandles) : rawCandles;
    
    // Store full history
    candleHistoryRef.current = allCandles;
    
    // Slice by visibleCandles for zoom (this is where zoom takes effect)
    return allCandles.slice(-visibleCandles);
  }, [trades, selectedInterval.value, chartView, visibleCandles]);

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
  // Footprint chart removed - moved to dedicated panel in TradingDashboard
  const showAnyChart = visualization.showPriceChart || visualization.showVolumeChart;

  if (!showAnyChart) {
    return null;
  }

  return (
    <div className={`flex flex-col h-full w-full min-h-0 ${className}`}>
      {(visualization.showPriceChart || visualization.showVolumeChart) && (
        <div className="flex-1 flex flex-col bg-black rounded overflow-hidden min-h-0">
          {/* Chart Header with Controls */}
          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800 flex-shrink-0 gap-2">
            {/* Left: Chart View Toggle */}
            <div className="flex items-center gap-1">
              {(['candlestick', 'heikin-ashi', 'line'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setChartView(view)}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-mono uppercase rounded transition-colors",
                    chartView === view
                      ? "bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/50"
                      : "text-gray-500 hover:text-gray-400 border border-transparent"
                  )}
                >
                  {view === 'candlestick' ? 'OHLC' : view === 'heikin-ashi' ? 'HA' : 'LINE'}
                </button>
              ))}
            </div>
            
            {/* Center: Time Interval Selector */}
            <div className="flex items-center gap-0.5 bg-gray-900/50 rounded px-1 py-0.5">
              {TIME_INTERVALS.map((interval) => (
                <button
                  key={interval.label}
                  onClick={() => setSelectedInterval(interval)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-mono rounded transition-colors",
                    selectedInterval.value === interval.value
                      ? "bg-[#00FF41] text-black font-bold"
                      : "text-gray-500 hover:text-[#00FF41] hover:bg-gray-800"
                  )}
                >
                  {interval.label}
                </button>
              ))}
            </div>
            
            {/* Right: Chart Controls */}
            <div className="flex items-center gap-1">
              <Tooltip content="Zoom In" position="left">
                <button
                  onClick={handleZoomIn}
                  className="p-1 text-gray-500 hover:text-[#00FF41] transition-colors rounded hover:bg-gray-800"
                >
                  <ZoomInIcon />
                </button>
              </Tooltip>
              <Tooltip content="Zoom Out" position="left">
                <button
                  onClick={handleZoomOut}
                  className="p-1 text-gray-500 hover:text-[#00FF41] transition-colors rounded hover:bg-gray-800"
                >
                  <ZoomOutIcon />
                </button>
              </Tooltip>
              <Tooltip content="Auto-scale: Fit chart to visible data" position="left">
                <button
                  onClick={handleAutoScale}
                  className="p-1 text-gray-500 hover:text-[#00FF41] transition-colors rounded hover:bg-gray-800"
                >
                  <AutoScaleIcon />
                </button>
              </Tooltip>
              <span className="text-[9px] font-mono text-gray-600 ml-1">
                {candleData.length} candles
              </span>
            </div>
          </div>
          <div 
            className="flex-1 min-h-0 relative overflow-hidden"
            onWheel={handleWheel}
          >
            {candleData.length > 0 ? (
              <CandlestickChart
                key={autoScaleKey}
                data={candleData}
                showVolume={visualization.showVolumeChart}
                showVwap={visualization.showVwapLine}
                className="absolute inset-0"
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
        </div>
      )}
    </div>
  );
}
