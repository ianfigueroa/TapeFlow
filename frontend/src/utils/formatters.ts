// Number formatting utilities for prices, volumes, and percentages

import { useSettingsStore } from '../stores/useSettingsStore';

// Get current color settings (for non-hook contexts)
function getColors() {
  return useSettingsStore.getState().colors;
}

export function formatPrice(price: number, _assetType?: string): string {
  if (!price || isNaN(price)) return '-';
  
  // Adaptive precision based on price magnitude
  if (price >= 100) return price.toFixed(2);    // BTC, ETH, BNB, SOL
  if (price >= 1) return price.toFixed(4);       // XRP, ADA, DOGE
  if (price >= 0.01) return price.toFixed(6);    // Low-cap alts
  return price.toFixed(8);                        // Micro-cap (SHIB, PEPE)
}

/**
 * Format order book size
 * 
 * Handles the full range from dust (<0.01) to whale orders (millions).
 * Uses K/M/B suffixes for large numbers to keep the UI compact.
 */
export function formatOrderBookSize(size: number): string {
  if (!size || isNaN(size) || size === 0) return '-';
  
  // Large orders get abbreviated
  if (size >= 1_000_000_000) {
    return (size / 1_000_000_000).toFixed(2) + 'B';
  }
  if (size >= 1_000_000) {
    return (size / 1_000_000).toFixed(2) + 'M';
  }
  if (size >= 1_000) {
    return (size / 1_000).toFixed(2) + 'K';
  }
  
  // Normal orders
  if (size >= 1) {
    return size.toFixed(2);
  }
  
  // Small orders need more decimals
  if (size >= 0.01) {
    return size.toFixed(4);
  }
  
  // Dust orders (common in crypto)
  return size.toFixed(5);
}

/**
 * Format volume with K/M/B suffixes
 */
export function formatVolume(volume: number): string {
  if (!volume || isNaN(volume)) return '-';
  
  if (volume >= 1_000_000_000) {
    return (volume / 1_000_000_000).toFixed(2) + 'B';
  }
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(2) + 'M';
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(2) + 'K';
  }
  return volume.toFixed(2);
}

/**
 * Format percentage with sign
 */
export function formatPercent(value: number, decimals: number = 2): string {
  if (!value || isNaN(value)) return '0.00%';
  return (value >= 0 ? '+' : '') + value.toFixed(decimals) + '%';
}

/**
 * Format timestamp to HH:MM:SS.mmm
 * 
 * Millisecond precision is important for seeing trade ordering.
 */
export function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

/**
 * Format full date and time
 */
export function formatDateTime(timestamp: number): string {
  if (!timestamp) return '-';
  
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format as USD currency
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  if (!value || isNaN(value)) return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format spread in basis points
 * 
 * bps = (spread / midPrice) * 10000
 * 1 bp = 0.01%
 */
export function formatSpread(spread: number, midPrice: number): string {
  if (!spread || !midPrice) return '-';
  const bps = (spread / midPrice) * 10000;
  return `${bps.toFixed(1)} bps`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(value: number, decimals: number = 0): string {
  if (!value || isNaN(value)) return '0';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format crypto dollar amount with K/M suffixes
 * Used for trade values (price * volume)
 */
const cryptoAmountFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCryptoAmount(value: number): string {
  if (!value || isNaN(value)) return '$0.00';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return cryptoAmountFormatter.format(value);
}

// =======================
// Color Utilities
// =======================
// Configurable colors - users can customize these via settings

/**
 * Get text color for buy/sell side
 * Uses configurable colors from settings store
 */
export function getSideColor(side: string): string {
  const colors = getColors();
  switch (side) {
    case 'buy':
      return `text-[${colors.buyColor}]`;
    case 'sell':
      return `text-[${colors.sellColor}]`;
    default:
      return `text-[${colors.neutralColor}]`;
  }
}

/**
 * Get raw hex color for buy/sell side (for inline styles and charts)
 */
export function getSideHexColor(side: string): string {
  const colors = getColors();
  switch (side) {
    case 'buy':
      return colors.buyColor;
    case 'sell':
      return colors.sellColor;
    default:
      return colors.neutralColor;
  }
}

/**
 * Get background color for buy/sell side
 * Uses configurable colors from settings store
 */
export function getSideBackground(side: string): string {
  const colors = getColors();
  switch (side) {
    case 'buy':
      return `bg-[${colors.buyBackground}] border-l-4 border-l-[${colors.buyColor}]`;
    case 'sell':
      return `bg-[${colors.sellBackground}] border-l-4 border-l-[${colors.sellColor}]`;
    default:
      return 'bg-black border-l-4 border-l-gray-700';
  }
}

/**
 * Get intensity-adjusted color based on trade size
 * Larger trades get more vivid colors
 */
export function getIntensityColor(side: string, amount: number): { color: string; background: string; isWhale: boolean } {
  const colors = getColors();
  const isWhale = amount >= colors.whaleThreshold;
  
  if (!colors.intensityEnabled) {
    return {
      color: side === 'buy' ? colors.buyColor : colors.sellColor,
      background: side === 'buy' ? colors.buyBackground : colors.sellBackground,
      isWhale,
    };
  }
  
  if (isWhale) {
    // Whale trades get maximum intensity with glow effect
    return {
      color: side === 'buy' ? colors.buyColor : colors.sellColor,
      background: side === 'buy' ? colors.buyBackground : colors.sellBackground,
      isWhale: true,
    };
  }
  
  // For smaller trades, adjust opacity
  return {
    color: side === 'buy' ? colors.buyColor : colors.sellColor,
    background: side === 'buy' ? colors.buyBackground : colors.sellBackground,
    isWhale: false,
  };
}

/**
 * Get color for price change (+/-)
 */
export function getPriceChangeColor(change: number): string {
  const colors = getColors();
  if (change > 0) return `text-[${colors.buyColor}]`;
  if (change < 0) return `text-[${colors.sellColor}]`;
  return `text-[${colors.neutralColor}]`;
}

/**
 * Get badge styling for crypto asset type
 */
export function getAssetTypeColor(_assetType: string): string {
  return 'bg-orange-500/20 text-orange-400';
}

/**
 * Truncate long strings with ellipsis
 */
export function truncate(str: string, length: number = 20): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}
