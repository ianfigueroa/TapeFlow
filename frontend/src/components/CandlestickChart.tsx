/**
 * Real-time Candlestick Chart using Canvas rendering
 * 
 * Renders OHLC candles aggregated from incoming trades.
 * Green candles = close > open (bullish)
 * Red candles = close < open (bearish)
 * 
 * Features:
 * - Proper OHLC with wicks (high-low lines)
 * - Volume bars at bottom
 * - VWAP line overlay
 * - Responsive to container size
 * - Current price marker
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

export interface CandleDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
}

interface CandlestickChartProps {
  data: CandleDataPoint[];
  width?: number;
  height?: number;
  showVolume?: boolean;
  showVwap?: boolean;
  className?: string;
}

export function CandlestickChart({
  data,
  width: propWidth,
  height: propHeight,
  showVolume = true,
  showVwap = true,
  className = '',
}: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = useSettingsStore((state) => state.colors);
  
  // Use container dimensions if props not specified
  const [dimensions, setDimensions] = useState({ width: propWidth || 600, height: propHeight || 300 });

  // Resize observer to fill container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({
            width: propWidth || Math.floor(width),
            height: propHeight || Math.floor(height),
          });
        }
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [propWidth, propHeight]);

  const { width, height } = dimensions;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 1) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Calculate price bounds with padding - ensure high/low are valid
    const validData = data.filter(d => 
      d.high >= d.low && 
      d.open > 0 && 
      d.close > 0 &&
      d.high > 0 &&
      d.low > 0
    );
    
    if (validData.length === 0) return;

    // Use all prices including VWAP for proper scaling
    const allHighs = validData.map(d => d.high);
    const allLows = validData.map(d => d.low);
    const allVwaps = validData.map(d => d.vwap).filter(v => v > 0);
    
    const rawMin = Math.min(...allLows, ...allVwaps);
    const rawMax = Math.max(...allHighs, ...allVwaps);
    
    // Add 0.5% padding to price range for visual breathing room
    const priceRange = rawMax - rawMin;
    const padding = priceRange * 0.005 || rawMin * 0.001;
    const minPrice = rawMin - padding;
    const maxPrice = rawMax + padding;
    
    const maxVolume = Math.max(...validData.map(d => d.volume), 1);

    // Chart layout - use more vertical space
    const chartTop = 15;
    const volumeAreaHeight = showVolume ? Math.min(60, height * 0.2) : 0;
    const chartBottom = height - volumeAreaHeight - 25; // Space for volume + labels
    const chartHeight = chartBottom - chartTop;
    const volumeTop = chartBottom + 5;
    const volumeHeight = volumeAreaHeight - 10;

    // Calculate candle dimensions - ensure minimum visibility
    const availableWidth = width - 60; // Margins for price labels
    const candleSpacing = Math.max(1, Math.floor(availableWidth / validData.length));
    const candleWidth = Math.max(3, Math.min(candleSpacing * 0.75, 20));
    const candleGap = candleSpacing - candleWidth;

    // Scale functions
    const xScale = (i: number) => 30 + i * candleSpacing + candleWidth / 2;
    const yScale = (price: number) => {
      if (maxPrice === minPrice) return chartTop + chartHeight / 2;
      return chartBottom - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
    };

    // Draw horizontal grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = chartTop + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(25, y);
      ctx.lineTo(width - 5, y);
      ctx.stroke();
    }

    // Draw volume bars first (behind candles)
    if (showVolume && volumeHeight > 0) {
      validData.forEach((candle, i) => {
        const x = xScale(i) - candleWidth / 2;
        const barHeight = (candle.volume / maxVolume) * volumeHeight;
        const y = volumeTop + volumeHeight - barHeight;
        const isBullish = candle.close >= candle.open;

        ctx.fillStyle = isBullish ? colors.buyColor + '40' : colors.sellColor + '40';
        ctx.fillRect(x, y, candleWidth, barHeight);
      });
    }

    // Draw VWAP line
    if (showVwap) {
      ctx.strokeStyle = colors.vwapLineColor || '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let started = false;
      validData.forEach((candle, i) => {
        if (candle.vwap <= 0) return;
        const x = xScale(i);
        const y = yScale(candle.vwap);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw candlesticks with proper OHLC
    validData.forEach((candle, i) => {
      const x = xScale(i);
      const isBullish = candle.close >= candle.open;
      const color = isBullish ? colors.buyColor : colors.sellColor;

      // === WICK (High-Low line) ===
      // This is the critical fix - always draw the full wick
      const highY = yScale(candle.high);
      const lowY = yScale(candle.low);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // === BODY ===
      const openY = yScale(candle.open);
      const closeY = yScale(candle.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1); // Minimum 1px height

      if (isBullish) {
        // Bullish: hollow candle with border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
        ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      } else {
        // Bearish: filled candle
        ctx.fillStyle = color;
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
    });

    // Draw current price marker and label
    const lastCandle = validData[validData.length - 1];
    const lastX = xScale(validData.length - 1);
    const lastY = yScale(lastCandle.close);
    const lastColor = lastCandle.close >= lastCandle.open ? colors.buyColor : colors.sellColor;

    // Price indicator line (dashed)
    ctx.strokeStyle = lastColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(lastX + candleWidth / 2 + 2, lastY);
    ctx.lineTo(width - 55, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label background
    ctx.fillStyle = lastColor;
    const priceText = lastCandle.close >= 1000 
      ? `$${lastCandle.close.toFixed(2)}`
      : lastCandle.close >= 1
        ? `$${lastCandle.close.toFixed(4)}`
        : `$${lastCandle.close.toFixed(6)}`;
    ctx.font = 'bold 10px monospace';
    const textWidth = ctx.measureText(priceText).width;
    ctx.fillRect(width - textWidth - 10, lastY - 8, textWidth + 8, 16);

    // Price label text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, width - 6, lastY);

    // Draw price scale on right side
    ctx.fillStyle = '#666666';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const priceStep = (maxPrice - minPrice) / gridLines;
    for (let i = 0; i <= gridLines; i++) {
      const price = minPrice + priceStep * i;
      const y = yScale(price);
      const priceLabel = price >= 1000 ? price.toFixed(2) : price.toFixed(4);
      ctx.fillText(priceLabel, width - 58, y);
    }

    // Draw VWAP label
    if (showVwap && lastCandle.vwap > 0) {
      const vwapY = yScale(lastCandle.vwap);
      ctx.fillStyle = colors.vwapLineColor || '#FFD700';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`VWAP`, 5, vwapY);
    }

    // Draw High/Low markers for the session
    const sessionHigh = Math.max(...validData.map(d => d.high));
    const sessionLow = Math.min(...validData.map(d => d.low));
    
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    
    // High marker
    ctx.fillStyle = colors.buyColor;
    ctx.fillText(`H: ${sessionHigh >= 1000 ? sessionHigh.toFixed(2) : sessionHigh.toFixed(4)}`, 5, chartTop + 8);
    
    // Low marker
    ctx.fillStyle = colors.sellColor;
    ctx.fillText(`L: ${sessionLow >= 1000 ? sessionLow.toFixed(2) : sessionLow.toFixed(4)}`, 5, chartTop + 18);

  }, [data, width, height, showVolume, showVwap, colors]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (data.length < 1) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center bg-black border border-gray-800 rounded w-full h-full ${className}`}
        style={{ minHeight: propHeight || 200 }}
      >
        <span className="text-gray-600 font-mono text-sm animate-pulse">Waiting for candle data...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className={`bg-black rounded w-full h-full ${className}`}
      style={{ minHeight: propHeight || 200 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  );
}
