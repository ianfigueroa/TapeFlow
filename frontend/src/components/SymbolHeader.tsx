// Symbol header with 24hr stats and network latency

import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { formatPrice, formatPercent, getPriceChangeColor, getAssetTypeColor, formatVolume } from '../utils/formatters';
import type { AssetType } from '../types';
import { flushTickerBuffer, getCurrentVwap, getLatency, resetLatencyTracker } from '../services/dataBuffer';

interface SymbolHeaderProps {
  symbol: string;
  name?: string;
  assetType: AssetType;
  lastPrice: number;
}

export function SymbolHeader({ symbol, name, assetType, lastPrice: fallbackPrice }: SymbolHeaderProps) {
  const [stats, setStats] = useState({
    lastPrice: fallbackPrice, priceChange: 0, priceChangePercent: 0,
    highPrice: 0, lowPrice: 0, vwap: 0, volume: 0,
  });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  
  useEffect(() => {
    if (!symbol) return;
    resetLatencyTracker(symbol);
    
    const intervalId = setInterval(() => {
      const { ticker } = flushTickerBuffer(symbol);
      const vwap = getCurrentVwap(symbol);
      
      if (ticker || vwap > 0) {
        setStats(prev => ({
          lastPrice: ticker?.lastPrice || prev.lastPrice || fallbackPrice,
          priceChange: ticker?.priceChange || prev.priceChange,
          priceChangePercent: ticker?.priceChangePercent || prev.priceChangePercent,
          highPrice: ticker?.highPrice || prev.highPrice,
          lowPrice: ticker?.lowPrice || prev.lowPrice,
          vwap: vwap || prev.vwap,
          volume: ticker?.volume || prev.volume,
        }));
      }
      setLatencyMs(getLatency(symbol));
    }, 100);
    
    return () => clearInterval(intervalId);
  }, [symbol, fallbackPrice]);
  
  const getLatencyColor = (latency: number | null) => {
    if (latency === null) return 'text-gray-600';
    if (latency < 100) return 'text-[#00FF41]';
    if (latency < 300) return 'text-yellow-500';
    return 'text-[#FF4545]';
  };
  
  const displayPrice = stats.lastPrice || fallbackPrice;
  
  return (
    <div className="p-3 border-b border-gray-800 bg-black">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", getAssetTypeColor(assetType))}>
              {assetType.toUpperCase()}
            </span>
            <h2 className="text-base font-mono font-bold text-white">{symbol}</h2>
            {latencyMs !== null && (
              <span className={cn("text-xs font-mono", getLatencyColor(latencyMs))}>[{latencyMs}ms]</span>
            )}
          </div>
          <p className="text-xs text-gray-600 font-mono">{name || 'Time & Sales'}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-white tabular-nums">{formatPrice(displayPrice, assetType)}</div>
            <div className={cn("text-sm font-mono tabular-nums", getPriceChangeColor(stats.priceChange))}>
              {formatPercent(stats.priceChangePercent)}
            </div>
          </div>
          
          <div className="text-right text-xs">
            <div className="text-gray-600 font-mono">VWAP</div>
            <div className="font-mono text-gray-300 tabular-nums">{stats.vwap > 0 ? formatPrice(stats.vwap, assetType) : '-'}</div>
          </div>
          
          <div className="text-right text-xs">
            <div className="text-gray-600 font-mono">HIGH</div>
            <div className="font-mono text-[#00FF41] tabular-nums">{stats.highPrice > 0 ? formatPrice(stats.highPrice, assetType) : '-'}</div>
          </div>
          
          <div className="text-right text-xs">
            <div className="text-gray-600 font-mono">LOW</div>
            <div className="font-mono text-[#FF4545] tabular-nums">{stats.lowPrice > 0 ? formatPrice(stats.lowPrice, assetType) : '-'}</div>
          </div>
          
          <div className="text-right text-xs">
            <div className="text-gray-600 font-mono">VOL</div>
            <div className="font-mono text-gray-400 tabular-nums">{stats.volume > 0 ? formatVolume(stats.volume) : '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
