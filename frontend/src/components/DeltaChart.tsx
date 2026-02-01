// Cumulative delta (order flow) chart using canvas rendering

import { useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

export interface DeltaDataPoint {
  timestamp: number;
  delta: number;  // Cumulative delta (buy volume - sell volume)
  buyVolume: number;
  sellVolume: number;
}

interface DeltaChartProps {
  data: DeltaDataPoint[];
  width?: number;
  height?: number;
  className?: string;
}

export function DeltaChart({
  data,
  width = 600,
  height = 150,
  className = '',
}: DeltaChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useSettingsStore((state) => state.colors);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Calculate bounds with safe guards
    const deltas = data.map((d) => d.delta);
    // Ensure we have valid deltas and prevent division by zero
    const absDeltas = deltas.map(Math.abs);
    const maxDelta = absDeltas.length > 0 ? Math.max(...absDeltas, 1) : 1;
    // Guard against edge case where all deltas are zero
    const safeMaxDelta = maxDelta > 0 ? maxDelta : 1;
    
    const chartTop = 10;
    const chartBottom = height - 20;
    const chartHeight = chartBottom - chartTop;
    const zeroY = chartTop + chartHeight / 2;

    // Helper functions with safe guards
    const xScale = (i: number) => {
      const ratio = data.length > 1 ? i / (data.length - 1) : 0;
      return ratio * (width - 20) + 10;
    };
    const yScale = (delta: number) => {
      const y = zeroY - (delta / safeMaxDelta) * (chartHeight / 2);
      return isFinite(y) ? y : zeroY;
    };

    // Draw zero line
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, zeroY);
    ctx.lineTo(width - 10, zeroY);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.setLineDash([2, 2]);
    for (let i = 1; i <= 2; i++) {
      const y1 = zeroY - (chartHeight / 4) * i;
      const y2 = zeroY + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(10, y1);
      ctx.lineTo(width - 10, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, y2);
      ctx.lineTo(width - 10, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw delta bars
    const barWidth = Math.max(2, (width - 20) / data.length - 1);
    data.forEach((point, i) => {
      const x = xScale(i) - barWidth / 2;
      const y = yScale(point.delta);
      const barHeight = Math.abs(zeroY - y);
      
      if (point.delta >= 0) {
        ctx.fillStyle = colors.deltaPositiveColor + 'CC'; // 80% opacity
        ctx.fillRect(x, y, barWidth, barHeight);
      } else {
        ctx.fillStyle = colors.deltaNegativeColor + 'CC';
        ctx.fillRect(x, zeroY, barWidth, barHeight);
      }
    });

    // Draw delta line on top
    ctx.strokeStyle = data[data.length - 1].delta >= 0 
      ? colors.deltaPositiveColor 
      : colors.deltaNegativeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.delta);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current delta marker
    const lastPoint = data[data.length - 1];
    const lastX = xScale(data.length - 1);
    const lastY = yScale(lastPoint.delta);
    
    ctx.fillStyle = lastPoint.delta >= 0 
      ? colors.deltaPositiveColor 
      : colors.deltaNegativeColor;
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
      
      let bgX = x - padding;
      if (align === 'right') bgX = x - textWidth - padding;
      else if (align === 'center') bgX = x - textWidth / 2 - padding;
      
      ctx.fillStyle = bgColor;
      ctx.fillRect(bgX, y - textHeight, textWidth + padding * 2, textHeight + padding);
      
      ctx.fillStyle = textColor;
      ctx.fillText(text, x, y);
    };

    // Draw labels with backgrounds
    drawTextWithBackground(`+${formatDelta(safeMaxDelta)}`, width - 2, chartTop + 10, '#aaaaaa', '10px monospace');
    drawTextWithBackground(`-${formatDelta(safeMaxDelta)}`, width - 2, chartBottom - 2, '#aaaaaa', '10px monospace');
    drawTextWithBackground('0', width - 2, zeroY + 3, '#aaaaaa', '10px monospace');

    // Current delta label with background
    const deltaColor = lastPoint.delta >= 0 
      ? colors.deltaPositiveColor 
      : colors.deltaNegativeColor;
    const sign = lastPoint.delta >= 0 ? '+' : '';
    drawTextWithBackground(
      `CVD: ${sign}${formatDelta(lastPoint.delta)}`,
      width - 2,
      lastY - 8,
      deltaColor,
      'bold 11px monospace',
      'right',
      'rgba(0, 0, 0, 0.85)'
    );

  }, [data, width, height, colors]);

  useEffect(() => {
    draw();
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

function formatDelta(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}K`;
  return abs.toFixed(2);
}
