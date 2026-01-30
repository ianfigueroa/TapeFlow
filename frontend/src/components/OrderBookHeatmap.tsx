// Order Book Depth Heatmap - Canvas-based visualization of liquidity over time
// Shows price levels on Y-axis, time on X-axis, with color intensity representing order size

import { useRef, useEffect, useCallback, useState } from 'react';
import type { OrderBook, OrderBookLevel } from '../types';
import { flushOrderBookBuffer } from '../services/dataBuffer';

// Configuration
const SNAPSHOT_INTERVAL_MS = 100;  // Store a snapshot every 100ms
const MAX_SNAPSHOTS = 100;         // Keep last 10 seconds of data (100 * 100ms)
const PRICE_LEVELS = 40;           // Number of price levels to display (20 bids + 20 asks)

// Heatmap color scale (Dark Blue/Black -> Yellow/White for high liquidity)
const HEATMAP_COLORS = {
  // Low liquidity
  empty: '#0a0a0a',
  low: '#0d1b2a',
  // Medium liquidity
  medium: '#1b4d72',
  // High liquidity (walls)
  high: '#f0b429',
  max: '#ffffff',
};

interface OrderBookSnapshot {
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
}

interface OrderBookHeatmapProps {
  symbol: string;
  width?: number;
  height?: number;
  className?: string;
  orderBook?: OrderBook | null;  // Optional external order book for direct rendering
}

/**
 * Circular buffer for efficient snapshot storage
 */
class SnapshotBuffer {
  private buffer: (OrderBookSnapshot | null)[];
  private head: number = 0;
  private size: number = 0;
  
  constructor(private maxSize: number) {
    this.buffer = new Array(maxSize).fill(null);
  }
  
  push(snapshot: OrderBookSnapshot): void {
    this.buffer[this.head] = snapshot;
    this.head = (this.head + 1) % this.maxSize;
    if (this.size < this.maxSize) this.size++;
  }
  
  getAll(): OrderBookSnapshot[] {
    const result: OrderBookSnapshot[] = [];
    const start = this.size < this.maxSize ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      const index = (start + i) % this.maxSize;
      const snapshot = this.buffer[index];
      if (snapshot) result.push(snapshot);
    }
    return result;
  }
  
  clear(): void {
    this.buffer = new Array(this.maxSize).fill(null);
    this.head = 0;
    this.size = 0;
  }
  
  get length(): number {
    return this.size;
  }
}

/**
 * Interpolate between two colors based on intensity (0-1)
 */
function interpolateColor(intensity: number): string {
  // Clamp intensity to 0-1
  const t = Math.max(0, Math.min(1, intensity));
  
  if (t < 0.01) return HEATMAP_COLORS.empty;
  // Apply minimum visibility floor - shift scale so low values are visible
  const adjustedT = 0.15 + t * 0.85;
  if (adjustedT < 0.33) {
    return lerpColor(HEATMAP_COLORS.low, HEATMAP_COLORS.medium, adjustedT / 0.33);
  }
  if (adjustedT < 0.66) {
    return lerpColor(HEATMAP_COLORS.medium, HEATMAP_COLORS.high, (adjustedT - 0.33) / 0.33);
  }
  return lerpColor(HEATMAP_COLORS.high, HEATMAP_COLORS.max, (adjustedT - 0.66) / 0.34);
}

/**
 * Linear interpolation between two hex colors
 */
function lerpColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function OrderBookHeatmap({
  symbol,
  width = 400,
  height = 300,
  className = '',
  orderBook: externalOrderBook,
}: OrderBookHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotBufferRef = useRef(new SnapshotBuffer(MAX_SNAPSHOTS));
  const [maxSize, setMaxSize] = useState(0);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0, mid: 0 });
  const lastSnapshotTimeRef = useRef(0);
  
  // Collect order book snapshots
  useEffect(() => {
    if (!symbol) return;
    
    snapshotBufferRef.current.clear();
    
    const intervalId = setInterval(() => {
      const { orderBook } = flushOrderBookBuffer(symbol);
      
      // Use external order book if provided, otherwise use buffered one
      const ob = externalOrderBook || orderBook;
      if (!ob || ob.bids.length === 0 || ob.asks.length === 0) return;
      
      const now = Date.now();
      
      // Only store a snapshot every SNAPSHOT_INTERVAL_MS
      if (now - lastSnapshotTimeRef.current < SNAPSHOT_INTERVAL_MS) return;
      lastSnapshotTimeRef.current = now;
      
      const midPrice = (ob.bids[0].price + ob.asks[0].price) / 2;
      
      const snapshot: OrderBookSnapshot = {
        timestamp: now,
        bids: ob.bids.slice(0, PRICE_LEVELS / 2),
        asks: ob.asks.slice(0, PRICE_LEVELS / 2),
        midPrice,
      };
      
      snapshotBufferRef.current.push(snapshot);
      
      // Calculate max size across all visible levels for normalization
      const allSizes = [...snapshot.bids, ...snapshot.asks].map(l => l.size);
      const currentMax = Math.max(...allSizes, 0);
      setMaxSize(prev => Math.max(prev * 0.99, currentMax)); // Decay slowly to keep scale stable
      
      // Update price range
      const allPrices = [...snapshot.bids, ...snapshot.asks].map(l => l.price);
      setPriceRange({
        min: Math.min(...allPrices),
        max: Math.max(...allPrices),
        mid: midPrice,
      });
    }, 50); // Poll more frequently than snapshot interval
    
    return () => clearInterval(intervalId);
  }, [symbol, externalOrderBook]);
  
  // Render the heatmap
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const snapshots = snapshotBufferRef.current.getAll();
    
    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.fillStyle = HEATMAP_COLORS.empty;
    ctx.fillRect(0, 0, width, height);
    
    if (snapshots.length < 2 || maxSize === 0 || priceRange.min === priceRange.max) {
      // Draw waiting message
      ctx.fillStyle = '#333333';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Building heatmap...', width / 2, height / 2);
      return;
    }
    
    // Layout
    const labelWidth = 60;   // Space for price labels on right
    const chartWidth = width - labelWidth;
    const chartHeight = height - 20;  // Space for time labels at bottom
    
    // Calculate cell dimensions
    const numTimeSlots = snapshots.length;
    const cellWidth = chartWidth / numTimeSlots;
    const cellHeight = chartHeight / PRICE_LEVELS;
    
    // Build price level map from latest snapshot
    const latestSnapshot = snapshots[snapshots.length - 1];
    const priceLevels: number[] = [];
    
    // Add ask prices (top of chart - high to low)
    const askPrices = latestSnapshot.asks.map(l => l.price).slice(0, PRICE_LEVELS / 2);
    askPrices.reverse();
    priceLevels.push(...askPrices);
    
    // Add bid prices (bottom of chart - high to low)
    const bidPrices = latestSnapshot.bids.map(l => l.price).slice(0, PRICE_LEVELS / 2);
    priceLevels.push(...bidPrices);
    
    // Draw heatmap cells
    snapshots.forEach((snapshot, timeIndex) => {
      const x = timeIndex * cellWidth;
      
      // Create a map of price -> size for this snapshot
      const priceToSize = new Map<number, number>();
      snapshot.bids.forEach(l => priceToSize.set(l.price, l.size));
      snapshot.asks.forEach(l => priceToSize.set(l.price, l.size));
      
      priceLevels.forEach((price, priceIndex) => {
        const y = priceIndex * cellHeight;
        
        // Find closest price in this snapshot
        let size = priceToSize.get(price) || 0;
        
        // If exact price not found, find closest
        if (size === 0) {
          const allPrices = Array.from(priceToSize.keys());
          const closest = allPrices.reduce((prev, curr) => 
            Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
          , allPrices[0]);
          if (Math.abs(closest - price) / price < 0.001) { // Within 0.1%
            size = priceToSize.get(closest) || 0;
          }
        }
        
        // Calculate intensity (0-1) using log scaling for visibility
        const logSize = size > 0 ? Math.log10(size + 1) : 0;
        const logMax = maxSize > 0 ? Math.log10(maxSize + 1) : 1;
        const intensity = Math.min(logSize / logMax, 1);
        
        // Get color from intensity
        ctx.fillStyle = interpolateColor(intensity);
        ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1); // +1 to avoid gaps
      });
    });
    
    // Draw mid-price line
    const midIndex = PRICE_LEVELS / 2;
    const midY = midIndex * cellHeight;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(chartWidth, midY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw price labels (right side)
    ctx.fillStyle = '#666666';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    
    // Show a few price labels
    const labelIndices = [0, Math.floor(PRICE_LEVELS / 4), PRICE_LEVELS / 2, Math.floor(3 * PRICE_LEVELS / 4), PRICE_LEVELS - 1];
    labelIndices.forEach(i => {
      if (priceLevels[i]) {
        const y = i * cellHeight + cellHeight / 2 + 3;
        const price = priceLevels[i];
        const isAsk = i < PRICE_LEVELS / 2;
        ctx.fillStyle = isAsk ? '#FF4545' : '#00FF41';
        ctx.fillText(price.toFixed(2), chartWidth + 4, y);
      }
    });
    
    // Draw mid price label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`MID`, chartWidth + 4, midY + 4);
    
    // Draw time labels (bottom)
    ctx.fillStyle = '#444444';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    
    const timeLabels = [0, Math.floor(numTimeSlots / 2), numTimeSlots - 1];
    timeLabels.forEach(i => {
      if (snapshots[i]) {
        const x = i * cellWidth + cellWidth / 2;
        const elapsed = Math.round((snapshots[numTimeSlots - 1].timestamp - snapshots[i].timestamp) / 1000);
        const label = elapsed === 0 ? 'NOW' : `-${elapsed}s`;
        ctx.fillText(label, x, height - 4);
      }
    });
    
    // Draw border
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, chartWidth, chartHeight);
    
  }, [width, height, maxSize, priceRange]);
  
  // Render loop
  useEffect(() => {
    let animationId: number;
    
    const render = () => {
      draw();
      animationId = requestAnimationFrame(render);
    };
    
    animationId = requestAnimationFrame(render);
    
    return () => cancelAnimationFrame(animationId);
  }, [draw]);
  
  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="bg-black rounded"
        style={{ width, height }}
      />
      {/* Legend */}
      <div className="absolute bottom-6 left-2 flex items-center gap-1 text-[10px] font-mono bg-black/80 px-2 py-1 rounded">
        <span className="text-gray-500">Low</span>
        <div className="flex">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(intensity => (
            <div 
              key={intensity}
              className="w-3 h-3"
              style={{ backgroundColor: interpolateColor(intensity) }}
            />
          ))}
        </div>
        <span className="text-yellow-400">High</span>
      </div>
    </div>
  );
}

export default OrderBookHeatmap;
