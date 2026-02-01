/**
 * CVDOverlay - Cumulative Volume Delta chart overlay/pane
 * 
 * Shows divergence between aggressive buying and selling volume
 * to spot absorption and hidden buying/selling pressure
 */

import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { cn } from '../lib/utils';
import { subscribeToTrades } from '../services/dataBuffer';
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
  const { path, areaPath, zeroY } = useMemo(() => {
    if (dataPoints.length < 2) {
      return { path: '', areaPath: '', zeroY: height / 2, bounds: { min: -1, max: 1 } };
    }

    const cvdValues = dataPoints.map(d => d.cvd);
    const minCVD = Math.min(...cvdValues, 0);
    const maxCVD = Math.max(...cvdValues, 0);
    const range = Math.max(Math.abs(maxCVD), Math.abs(minCVD)) * 1.1 || 1;
    
    const padding = 4;
    const chartHeight = height - padding * 2;
    const chartWidth = 300; // Will be scaled by viewBox
    
    // Zero line position
    const zero = chartHeight / 2 + padding;
    
    const points = dataPoints.map((d, i) => {
      const x = (i / (dataPoints.length - 1)) * chartWidth;
      const y = zero - (d.cvd / range) * (chartHeight / 2);
      return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    // Area path (filled to zero line)
    const area = `M 0 ${zero} ` + 
      points.map(p => `L ${p.x} ${p.y}`).join(' ') + 
      ` L ${chartWidth} ${zero} Z`;

    return { 
      path: linePath, 
      areaPath: area, 
      zeroY: zero,
      bounds: { min: minCVD, max: maxCVD }
    };
  }, [dataPoints, height]);

  const formatCVD = (value: number): string => {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(2);
  };

  const formatDollar = (value: number): string => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const isPositive = stats.current >= 0;

  return (
    <div className={cn("flex flex-col bg-black border border-gray-800 rounded overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30">
        <span className="text-xs font-mono font-semibold text-cyan-500 tracking-wider">
          CVD
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-[#00FF41]">B: {formatDollar(stats.buyVol)}</span>
          <span className="text-[#FF4545]">S: {formatDollar(stats.sellVol)}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative" style={{ height }}>
        <svg 
          viewBox={`0 0 300 ${height}`} 
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Zero line */}
          <line 
            x1="0" 
            y1={zeroY} 
            x2="300" 
            y2={zeroY} 
            stroke="#374151" 
            strokeWidth="0.5" 
            strokeDasharray="4,4"
          />
          
          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={isPositive ? 'rgba(0, 255, 65, 0.1)' : 'rgba(255, 69, 69, 0.1)'}
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
