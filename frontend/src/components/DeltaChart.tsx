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

    // Calculate bounds
    const deltas = data.map((d) => d.delta);
    const maxDelta = Math.max(...deltas.map(Math.abs), 1);
    
    const chartTop = 10;
    const chartBottom = height - 20;
    const chartHeight = chartBottom - chartTop;
    const zeroY = chartTop + chartHeight / 2;

    // Helper functions
    const xScale = (i: number) => (i / (data.length - 1)) * (width - 20) + 10;
    const yScale = (delta: number) => zeroY - (delta / maxDelta) * (chartHeight / 2);

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

    // Draw labels
    ctx.fillStyle = '#666666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    
    // Max/min labels
    ctx.fillText(`+${formatDelta(maxDelta)}`, width - 2, chartTop + 10);
    ctx.fillText(`-${formatDelta(maxDelta)}`, width - 2, chartBottom - 2);
    ctx.fillText('0', width - 2, zeroY + 3);

    // Current delta label
    ctx.fillStyle = lastPoint.delta >= 0 
      ? colors.deltaPositiveColor 
      : colors.deltaNegativeColor;
    ctx.font = 'bold 11px monospace';
    const sign = lastPoint.delta >= 0 ? '+' : '';
    ctx.fillText(`CVD: ${sign}${formatDelta(lastPoint.delta)}`, width - 2, lastY - 8);

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
