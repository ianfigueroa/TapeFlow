// Number formatting utilities for prices, volumes, and percentages

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
// HIGH CONTRAST MODE - Maximum visibility on pure black backgrounds
// Using terminal-style neon colors that are easy on the eyes

/**
 * Get text color for buy/sell side
 * 
 * Terminal Green (#00FF41) for buys - classic terminal look, very readable
 * Bright Red (#FF4545) for sells - urgent but not harsh
 */
export function getSideColor(side: string): string {
  switch (side) {
    case 'buy':
      return 'text-[#00FF41]';  // Terminal green - easier on eyes than pure neon
    case 'sell':
      return 'text-[#FF4545]';  // Bright red - visible but not harsh
    default:
      return 'text-gray-500';
  }
}

/**
 * Get background color for buy/sell side
 * 
 * PURE BLACK base (#000000) for maximum contrast
 * NO transitions or fading - colors stay permanent
 * Thick left border for instant side recognition
 */
export function getSideBackground(side: string): string {
  switch (side) {
    case 'buy':
      // Pure black with minimal green tint + bright border
      return 'bg-black border-l-4 border-l-[#00FF41]';
    case 'sell':
      // Pure black with minimal red tint + bright border  
      return 'bg-black border-l-4 border-l-[#FF4545]';
    default:
      return 'bg-black border-l-4 border-l-gray-700';
  }
}

/**
 * Get color for price change (+/-)
 */
export function getPriceChangeColor(change: number): string {
  if (change > 0) return 'text-[#00FF41]';  // Terminal green
  if (change < 0) return 'text-[#FF4545]';  // Bright red
  return 'text-gray-400';
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
