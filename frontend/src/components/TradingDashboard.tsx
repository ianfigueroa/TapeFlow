/**
 * TradingDashboard - Professional Bento-box style trading terminal
 * 
 * CSS Grid-based layout with responsive panels.
 * 
 * Layout (Bento-box grid):
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  TAPE          │  PRICE CHART (expanded)          │  ORDER BOOK     │
 * │  (Time&Sales)  │                                  │  + IMBALANCE    │
 * │                ├──────────────────────────────────┤                 │
 * │                │  FOOTPRINT + CVD                 │                 │
 * ├────────────────┼──────────────────────────────────┼─────────────────┤
 * │  TABBED TOOLS (Analytics / News / Signals)       │  QUANT TOOLS    │
 * │  (full height for readability)                   │  (OI, Liq Map)  │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { memo, useMemo } from 'react';
import { cn } from '../lib/utils';
import { TapeTable } from './TapeTable';
import { OrderBook } from './OrderBook';
import { ChartPanel } from './ChartPanel';
import { FootprintChart } from './FootprintChart';
import { VolumeProfile } from './VolumeProfile';
import { TabbedToolsPanel } from './TabbedToolsPanel';
import { ImbalanceMeter } from './ImbalanceMeter';
import { CVDOverlay } from './CVDOverlay';
import { OIMonitor } from './OIMonitor';
import { LiquidationHeatmap } from './LiquidationHeatmap';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { SymbolState } from '../types';

interface TradingDashboardProps {
  symbolData: SymbolState;
  pauseScroll: boolean;
}

// Compact panel header
const PanelHeader = memo(function PanelHeader({ 
  title, 
  color = 'text-orange-500',
  subtitle 
}: { 
  title: string; 
  color?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-mono font-semibold tracking-wider", color)}>
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] text-gray-600 font-mono">{subtitle}</span>
        )}
      </div>
    </div>
  );
});

// Panel wrapper
const Panel = memo(function Panel({ 
  children, 
  className,
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "bg-black border border-gray-800 rounded overflow-hidden flex flex-col h-full w-full",
        className
      )}
    >
      {children}
    </div>
  );
});

export const TradingDashboard = memo(function TradingDashboard({
  symbolData,
  pauseScroll
}: TradingDashboardProps) {
  const visualization = useSettingsStore((state) => state.visualization);
  const showCharts = visualization.showPriceChart || visualization.showVolumeChart || visualization.showDeltaChart;

  // Get current price for liquidation heatmap - check multiple sources
  const currentPrice = useMemo(() => {
    // Try from trades first (most recent)
    if (symbolData.trades && symbolData.trades.length > 0) {
      // trades[0] should be the most recent - just use that price
      const price = symbolData.trades[0].price;
      if (price && price > 0) return price;
    }
    // Fallback to orderbook mid-price
    if (symbolData.orderBook?.bids?.[0] && symbolData.orderBook?.asks?.[0]) {
      const bid = symbolData.orderBook.bids[0].price;
      const ask = symbolData.orderBook.asks[0].price;
      if (bid > 0 && ask > 0) return (bid + ask) / 2;
    }
    return 0;
  }, [symbolData.trades, symbolData.orderBook]);

  return (
    <div className="bento-dashboard h-full w-full p-1 gap-1">
      {/* ═══════════════════════════════════════════════════════════════════
          LEFT COLUMN: Time & Sales Tape
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-tape">
        <Panel className="tape-panel">
          <PanelHeader 
            title="TIME & SALES" 
            color="text-[#00FF41]"
            subtitle={`${symbolData.trades.length} trades`}
          />
          <div className="flex-1 overflow-hidden min-h-0">
            <TapeTable
              trades={symbolData.trades}
              assetType={symbolData.assetType}
              symbol={symbolData.symbol}
              pauseScroll={pauseScroll}
              showAnalytics={false}
              compact={true}
            />
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CENTER TOP: Main Price/Volume Chart (expanded)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-chart">
        <Panel className="chart-panel">
          <PanelHeader 
            title="PRICE / VOLUME / VWAP" 
            color="text-cyan-500"
          />
          <div className="flex-1 overflow-hidden min-h-0">
            {showCharts ? (
              <ChartPanel
                trades={symbolData.trades}
                symbol={symbolData.symbol}
                width={800}
                compact={false}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                Charts disabled in settings
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT TOP: Order Book + Imbalance Meter
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-orderbook">
        <Panel className="orderbook-panel">
          <PanelHeader 
            title="ORDER BOOK" 
            color="text-orange-500"
            subtitle="L2 Depth"
          />
          <div className="flex-1 overflow-hidden min-h-0 flex">
            {/* Main OrderBook */}
            <div className="flex-1 min-w-0">
              <OrderBook
                orderBook={symbolData.orderBook}
                assetType={symbolData.assetType}
                symbol={symbolData.symbol}
                showHeatmap={true}
                maxLevels={15}
              />
            </div>
            {/* Imbalance Meter sidebar */}
            <div className="w-20 border-l border-gray-800 flex-shrink-0">
              <ImbalanceMeter
                symbol={symbolData.symbol}
                levels={10}
                orientation="vertical"
                showLabels={true}
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CENTER BOTTOM: Footprint
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-footprint">
        <Panel className="footprint-panel">
          <PanelHeader 
            title="FOOTPRINT" 
            color="text-purple-500" 
            subtitle="BID × ASK"
          />
          <div className="flex-1 overflow-hidden min-h-0">
            <FootprintChart
              symbol={symbolData.symbol}
              trades={symbolData.trades}
            />
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CVD Panel
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-cvd">
        <Panel className="cvd-panel">
          <CVDOverlay 
            symbol={symbolData.symbol}
            height={100}
          />
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT MIDDLE: Volume Profile
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-profile">
        <Panel className="profile-panel">
          <PanelHeader 
            title="VOLUME PROFILE" 
            color="text-blue-500" 
            subtitle="POC / VAH / VAL"
          />
          <div className="flex-1 overflow-hidden min-h-0">
            <VolumeProfile symbol={symbolData.symbol} compact={false} />
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM LEFT: Tabbed Tools Panel (Analytics, News, Signals)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-tools">
        <div className="h-full w-full bg-black border border-gray-800 rounded overflow-hidden">
          <TabbedToolsPanel symbol={symbolData.symbol} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM RIGHT: Quant Tools Stack (OI Monitor, Liquidation Heatmap)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bento-quant">
        <div className="h-full w-full flex flex-col gap-1">
          <div className="flex-1 min-h-0">
            <OIMonitor symbol={symbolData.symbol} className="h-full" />
          </div>
          <div className="flex-1 min-h-0">
            <LiquidationHeatmap 
              symbol={symbolData.symbol} 
              currentPrice={currentPrice}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default TradingDashboard;
