// Real-time price and volume chart using canvas rendering

import { useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

export interface PriceDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  vwap: number;
  delta: number;
}

interface PriceChartProps {
  data: PriceDataPoint[];
  width?: number;
  height?: number;
  showVolume?: boolean;
  showVwap?: boolean;
  className?: string;
}

export function PriceChart({
  data,
  width = 600,
  height = 200,
  showVolume = true,
  showVwap = true,
  className = '',
}: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useSettingsStore((state) => state.colors);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

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

    // Calculate bounds
    const prices = data.map((d) => d.price);
    const vwaps = data.map((d) => d.vwap);
    const volumes = data.map((d) => d.volume);
    
    const minPrice = Math.min(...prices, ...vwaps) * 0.999;
    const maxPrice = Math.max(...prices, ...vwaps) * 1.001;
    const maxVolume = Math.max(...volumes);

    const chartTop = 10;
    const chartBottom = showVolume ? height - 50 : height - 20;
    const chartHeight = chartBottom - chartTop;
    const volumeTop = chartBottom + 5;
    const volumeHeight = height - volumeTop - 5;

    // Helper functions
    const xScale = (i: number) => (i / (data.length - 1)) * (width - 20) + 10;
    const yScale = (price: number) =>
      chartBottom - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;

    // Draw grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = chartTop + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
    }

    // Draw volume bars if enabled
    if (showVolume && volumeHeight > 0) {
      const barWidth = Math.max(1, (width - 20) / data.length - 1);
      data.forEach((point, i) => {
        const x = xScale(i) - barWidth / 2;
        const barHeight = (point.volume / maxVolume) * volumeHeight;
        const y = volumeTop + volumeHeight - barHeight;

        ctx.fillStyle = colors.volumeBarColor + '60'; // 60% opacity
        ctx.fillRect(x, y, barWidth, barHeight);
      });
    }

    // Draw VWAP line if enabled
    if (showVwap) {
      ctx.strokeStyle = colors.vwapLineColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      data.forEach((point, i) => {
        const x = xScale(i);
        const y = yScale(point.vwap);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw price line
    ctx.strokeStyle = colors.priceLineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.price);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current price marker
    const lastPoint = data[data.length - 1];
    const lastX = xScale(data.length - 1);
    const lastY = yScale(lastPoint.price);
    
    ctx.fillStyle = colors.priceLineColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Helper function to draw text with background for visibility
    const drawTextWithBackground = (
      text: string,
      x: number,
      y: number,
      textColor: string,
      font: string,
      align: CanvasTextAlign = 'right',
      bgColor: string = 'rgba(0, 0, 0, 0.75)',
      padding: number = 2
    ) => {
      ctx.font = font;
      ctx.textAlign = align;
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = parseInt(font) || 10;
      
      // Calculate background position based on alignment
      let bgX = x - padding;
      if (align === 'right') bgX = x - textWidth - padding;
      else if (align === 'center') bgX = x - textWidth / 2 - padding;
      
      // Draw background
      ctx.fillStyle = bgColor;
      ctx.fillRect(bgX, y - textHeight, textWidth + padding * 2, textHeight + padding);
      
      // Draw text
      ctx.fillStyle = textColor;
      ctx.fillText(text, x, y);
    };

    // Draw price labels with backgrounds
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    
    const priceStep = (maxPrice - minPrice) / 4;
    for (let i = 0; i <= 4; i++) {
      const price = minPrice + priceStep * i;
      const y = yScale(price);
      drawTextWithBackground(price.toFixed(2), width - 2, y + 3, '#aaaaaa', '10px monospace');
    }

    // Draw current price label with background
    drawTextWithBackground(
      `$${lastPoint.price.toFixed(2)}`,
      width - 2,
      lastY - 8,
      colors.priceLineColor,
      'bold 11px monospace',
      'right',
      'rgba(0, 0, 0, 0.85)'
    );

    // Draw VWAP label if enabled with background
    if (showVwap) {
      const vwapY = yScale(lastPoint.vwap);
      drawTextWithBackground(
        `VWAP: ${lastPoint.vwap.toFixed(2)}`,
        width - 2,
        vwapY + 12,
        '#F59E0B',  // Amber color to match the dashed VWAP line
        '10px monospace',
        'right',
        'rgba(0, 0, 0, 0.75)'
      );
    }

  }, [data, width, height, showVolume, showVwap, colors]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  if (data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center bg-black border border-gray-800 rounded ${className}`}
        style={{ width, height }}
      >
        <span className="text-gray-600 font-mono text-sm">Waiting for data...</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`bg-black rounded ${className}`}
      style={{ width, height }}
    />
  );
}
