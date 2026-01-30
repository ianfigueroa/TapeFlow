import type { Trade, OrderBook, OrderBookLevel, TradeWithAnalytics } from '../types';

export interface OrderBookSnapshot {
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
}

export interface FootprintCluster {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  priceLevels: Map<number, { bid: number; ask: number }>;
  poc: number;
  totalVolume: number;
}

export interface LiquidityZone {
  price: number;
  size: number;
  side: 'bid' | 'ask';
  firstSeen: number;
  active: boolean;
}

export interface EngineData {
  trades: TradeWithAnalytics[];
  orderBook: OrderBook | null;
  orderBookSnapshot?: OrderBookSnapshot;
  vwap: number;
  cvd: number;
  liquidityZones: LiquidityZone[];
  poc?: number;
}

export interface ThemeColors {
  background: string;
  grid: string;
  gridLight: string;
  text: string;
  textMuted: string;
  buy: string;
  sell: string;
  vwap: string;
  poc: string;
  bidZone: string;
  askZone: string;
  heatmapEmpty: string;
  heatmapLow: string;
  heatmapMedium: string;
  heatmapHigh: string;
  heatmapMax: string;
}

export const DEFAULT_THEME: ThemeColors = {
  background: '#0a0a0a',
  grid: '#1a1a1a',
  gridLight: '#2a2a2a',
  text: '#ffffff',
  textMuted: '#666666',
  buy: '#00FF41',
  sell: '#FF4545',
  vwap: '#F59E0B',
  poc: '#FACC15',
  bidZone: '#06B6D4',
  askZone: '#EC4899',
  heatmapEmpty: '#0a0a0a',
  heatmapLow: '#0d1b2a',
  heatmapMedium: '#1b4d72',
  heatmapHigh: '#f0b429',
  heatmapMax: '#ffffff',
};

export interface Viewport {
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  timeStart: number;
  timeEnd: number;
}
