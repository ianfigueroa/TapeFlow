// Tab button showing symbol, price, and 24hr change

import { useRef, useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { formatPrice, formatPercent, getPriceChangeColor, getAssetTypeColor } from '../utils/formatters';
import type { AssetType } from '../types';
import { flushTickerBuffer } from '../services/dataBuffer';

const RENDER_INTERVAL_MS = 100;

interface SymbolTabProps {
  symbol: string;
  assetType: AssetType;
  isActive: boolean;
  fallbackPrice?: number;
  fallbackChangePercent?: number;
  onClick: () => void;
  onClose: () => void;
  onPopout: () => void;
}

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PopoutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

export function SymbolTab({
  symbol,
  assetType,
  isActive,
  fallbackPrice,
  fallbackChangePercent,
  onClick,
  onClose,
  onPopout,
}: SymbolTabProps) {
  const [tickerData, setTickerData] = useState({
    lastPrice: fallbackPrice,
    priceChangePercent: fallbackChangePercent,
  });
  const hasReceivedTickerRef = useRef(false);

  useEffect(() => {
    if (!symbol) return;

    const intervalId = setInterval(() => {
      const { ticker } = flushTickerBuffer(symbol);
      if (ticker) {
        hasReceivedTickerRef.current = true;
        setTickerData({
          lastPrice: ticker.lastPrice,
          priceChangePercent: ticker.priceChangePercent,
        });
      }
    }, RENDER_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [symbol]);

  const displayPrice = (hasReceivedTickerRef.current ? tickerData.lastPrice : fallbackPrice) ?? 0;
  const displayChangePercent = (hasReceivedTickerRef.current ? tickerData.priceChangePercent : fallbackChangePercent) ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded border transition-all font-mono text-sm",
        isActive
          ? "bg-black border-[#00FF41] text-[#00FF41]"
          : "bg-black border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("text-xs px-1 py-0.5 rounded", getAssetTypeColor(assetType))}>
          {assetType.slice(0, 1).toUpperCase()}
        </span>
        <span className="font-medium">{symbol}</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="tabular-nums">{formatPrice(displayPrice, assetType)}</span>
        <span className={cn("tabular-nums", getPriceChangeColor(displayChangePercent))}>
          {formatPercent(displayChangePercent)}
        </span>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[#FF4545] transition-all"
      >
        <XIcon />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onPopout(); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-white transition-all"
        title="Pop out to new window"
      >
        <PopoutIcon />
      </button>
    </button>
  );
}
