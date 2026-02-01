/**
 * CVDOverlay - Cumulative Volume Delta chart overlay/pane
 * 
 * Shows divergence between aggressive buying and selling volume
 * to spot absorption and hidden buying/selling pressure
 */

import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { subscribeToTrades } from '../services/dataBuffer';
import { LabelWithTooltip } from './Tooltip';
import type { Trade } from '../types';

interface CVDDataPoint {
  timestamp: number;
  cvd: number;
  price: number;
  buyVolume: number;
  sellVolume: number;
}

interface CVDOverlayProps {
  symbol: string;
  height?: number;
  maxPoints?: number;
  className?: string;
}

export const CVDOverlay = memo(function CVDOverlay({
  symbol,
  height = 120,
  maxPoints = 200,
  className,
}: CVDOverlayProps) {
  const [dataPoints, setDataPoints] = useState<CVDDataPoint[]>([]);
  const [stats, setStats] = useState({ 
    current: 0, 
    high: 0, 
    low: 0,
    buyVol: 0,
    sellVol: 0,
  });
  
  const cvdRef = useRef(0);
  const buyVolRef = useRef(0);
  const sellVolRef = useRef(0);
  const lastPriceRef = useRef(0);
  const batchRef = useRef<{ buy: number; sell: number; price: number }>({ buy: 0, sell: 0, price: 0 });
  
  // Helper function - defined before useMemo that uses it
  const formatCVD = useCallback((value: number): string => {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(2);
  }, []);

  const formatDollar = useCallback((value: number): string => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }, []);

  // Reset on symbol change
  useEffect(() => {
    setDataPoints([]);
    cvdRef.current = 0;
    buyVolRef.current = 0;
    sellVolRef.current = 0;
    lastPriceRef.current = 0;
    batchRef.current = { buy: 0, sell: 0, price: 0 };
    setStats({ current: 0, high: 0, low: 0, buyVol: 0, sellVol: 0 });
  }, [symbol]);
  
  // Manual reset handler
  const handleReset = useCallback(() => {
    setDataPoints([]);
    cvdRef.current = 0;
    buyVolRef.current = 0;
    sellVolRef.current = 0;
    batchRef.current = { buy: 0, sell: 0, price: lastPriceRef.current };
    setStats({ current: 0, high: 0, low: 0, buyVol: 0, sellVol: 0 });
  }, []);

  // Subscribe to trades
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      
      const delta = trade.side === 'buy' ? trade.volume : -trade.volume;
      cvdRef.current += delta;
      lastPriceRef.current = trade.price;
      
      if (trade.side === 'buy') {
        buyVolRef.current += trade.volume * trade.price;
        batchRef.current.buy += trade.volume * trade.price;
      } else {
        sellVolRef.current += trade.volume * trade.price;
        batchRef.current.sell += trade.volume * trade.price;
      }
      batchRef.current.price = trade.price;
    });

    return () => unsubscribe();
  }, [symbol]);

  // Batch updates at 500ms interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (batchRef.current.price === 0 && dataPoints.length === 0) return;
      
      const newPoint: CVDDataPoint = {
        timestamp: Date.now(),
        cvd: cvdRef.current,
        price: lastPriceRef.current,
        buyVolume: batchRef.current.buy,
        sellVolume: batchRef.current.sell,
      };
      
      setDataPoints(prev => {
        const next = [...prev, newPoint];
        if (next.length > maxPoints) next.shift();
        return next;
      });
      
      setStats({
        current: cvdRef.current,
        high: Math.max(stats.high, cvdRef.current),
        low: Math.min(stats.low, cvdRef.current),
        buyVol: buyVolRef.current,
        sellVol: sellVolRef.current,
      });
      
      // Reset batch
      batchRef.current = { buy: 0, sell: 0, price: lastPriceRef.current };
    }, 500);

    return () => clearInterval(interval);
  }, [maxPoints, dataPoints.length, stats.high, stats.low]);

  // Compute SVG path
  const { path, areaPathPositive, areaPathNegative, zeroY, yAxisLabels } = useMemo(() => {
    if (!dataPoints || dataPoints.length < 2) {
      return { path: '', areaPathPositive: '', areaPathNegative: '', zeroY: height / 2, yAxisLabels: [] };
    }

    const cvdValues = dataPoints.map(d => d.cvd);
    // Safe min/max calculation - guard against empty arrays
    const minCVD = cvdValues.length > 0 ? Math.min(...cvdValues) : 0;
    const maxCVD = cvdValues.length > 0 ? Math.max(...cvdValues) : 0;
    
    // Use independent min/max with 10% padding for better scale utilization
    const absMax = Math.max(Math.abs(maxCVD), Math.abs(minCVD), 1);
    const padding10 = absMax * 0.1;
    const yMin = Math.min(minCVD, 0) - padding10;
    const yMax = Math.max(maxCVD, 0) + padding10;
    const range = yMax - yMin;
    
    const padding = 4;
    const yAxisWidth = 45; // Space for Y-axis labels
    const chartHeight = height - padding * 2;
    const chartWidth = 300 - yAxisWidth; // Will be scaled by viewBox
    
    // Zero line position - calculated based on where 0 falls in the yMin..yMax range
    const zeroRatio = (yMax - 0) / range;
    const zero = padding + zeroRatio * chartHeight;
    
    const points = dataPoints.map((d, i) => {
      // Safe division - dataPoints.length is at least 2 here, but guard anyway
      const xRatio = dataPoints.length > 1 ? i / (dataPoints.length - 1) : 0;
      const x = yAxisWidth + xRatio * chartWidth;
      // Y is mapped from yMax (top) to yMin (bottom)
      const yRatio = (yMax - d.cvd) / range;
      const y = padding + yRatio * chartHeight;
      return { x, y: isFinite(y) ? y : zero, cvd: d.cvd };
    });

    if (points.length === 0) {
      return { path: '', areaPathPositive: '', areaPathNegative: '', zeroY: zero, yAxisLabels: [] };
    }

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    // Separate area paths for positive and negative regions
    let positiveArea = `M ${yAxisWidth} ${zero}`;
    let negativeArea = `M ${yAxisWidth} ${zero}`;
    
    points.forEach((p) => {
      if (p.cvd >= 0) {
        positiveArea += ` L ${p.x} ${p.y}`;
      } else {
        positiveArea += ` L ${p.x} ${zero}`;
      }
      
      if (p.cvd <= 0) {
        negativeArea += ` L ${p.x} ${p.y}`;
      } else {
        negativeArea += ` L ${p.x} ${zero}`;
      }
    });
    
    positiveArea += ` L ${yAxisWidth + chartWidth} ${zero} Z`;
    negativeArea += ` L ${yAxisWidth + chartWidth} ${zero} Z`;
    
    // Generate Y-axis labels using the independent min/max range
    const numLabels = 5;
    const labels: { y: number; value: string }[] = [];
    for (let i = 0; i <= numLabels; i++) {
      const ratio = i / numLabels;
      // Map from yMax (top, i=0) to yMin (bottom, i=numLabels)
      const cvdValue = yMax - (ratio * range);
      const y = padding + (ratio * chartHeight);
      labels.push({
        y,
        value: formatCVD(cvdValue)
      });
    }

    return { 
      path: linePath, 
      areaPathPositive: positiveArea, 
      areaPathNegative: negativeArea, 
      zeroY: zero,
      yAxisLabels: labels
    };
  }, [dataPoints, height, formatCVD]);

  const isPositive = stats.current >= 0;

  return (
    <div className={cn("flex flex-col bg-black border border-gray-800 rounded overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30">
        <span className="text-xs font-mono font-semibold text-cyan-500 tracking-wider">
          <LabelWithTooltip label="CVD" term="CVD" />
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-[#00FF41]">B: {formatDollar(stats.buyVol)}</span>
            <span className="text-[#FF4545]">S: {formatDollar(stats.sellVol)}</span>
          </div>
          {/* Reset button */}
          <button
            onClick={handleReset}
            className="px-1.5 py-0.5 text-[9px] font-mono text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors"
            title="Reset CVD to zero"
          >
            RESET
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative" style={{ height }}>
        <svg 
          viewBox={`0 0 300 ${height}`} 
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Y-axis labels */}
          {yAxisLabels.map((label, i) => (
            <text
              key={i}
              x="2"
              y={label.y}
              fill="#666"
              fontSize="8"
              fontFamily="monospace"
              dominantBaseline="middle"
            >
              {label.value}
            </text>
          ))}
          
          {/* Y-axis line */}
          <line
            x1="42"
            y1="4"
            x2="42"
            y2={height - 4}
            stroke="#333"
            strokeWidth="1"
          />
          
          {/* Zero line */}
          <line 
            x1="42" 
            y1={zeroY} 
            x2="300" 
            y2={zeroY} 
            stroke="#555" 
            strokeWidth="1" 
            strokeDasharray="4,4"
          />
          
          {/* Positive area fill (green, above zero) */}
          {areaPathPositive && (
            <path
              d={areaPathPositive}
              fill="rgba(0, 255, 65, 0.15)"
            />
          )}
          
          {/* Negative area fill (red, below zero) */}
          {areaPathNegative && (
            <path
              d={areaPathNegative}
              fill="rgba(255, 69, 69, 0.15)"
            />
          )}
          
          {/* CVD line */}
          {path && (
            <path
              d={path}
              fill="none"
              stroke={isPositive ? '#00FF41' : '#FF4545'}
              strokeWidth="1.5"
            />
          )}
        </svg>

        {/* Current value overlay */}
        <div className="absolute top-2 right-2 text-right">
          <div className={cn(
            "text-lg font-bold font-mono tabular-nums",
            isPositive ? "text-[#00FF41]" : "text-[#FF4545]"
          )}>
            {isPositive ? '+' : ''}{formatCVD(stats.current)}
          </div>
          <div className="text-[9px] text-gray-500 font-mono">
            H: {formatCVD(stats.high)} / L: {formatCVD(stats.low)}
          </div>
        </div>

        {/* Waiting state */}
        {dataPoints.length < 2 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
            Accumulating CVD data...
          </div>
        )}
      </div>
    </div>
  );
});

export default CVDOverlay;
