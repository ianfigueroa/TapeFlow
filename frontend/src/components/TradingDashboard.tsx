/**
 * TradingDashboard - Professional Bento-box style trading terminal
 * 
 * Responsive CSS Grid layout utilizing 100% viewport without main window scrolling.
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
  subtitle,
  rightContent 
}: { 
  title: string; 
  color?: string;
  subtitle?: string;
  rightContent?: React.ReactNode;
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
      {rightContent}
    </div>
  );
});

// Panel wrapper with proper flex/grid sizing
const Panel = memo(function Panel({ 
  children, 
  className,
  gridArea,
}: { 
  children: React.ReactNode; 
  className?: string;
  gridArea?: string;
}) {
  return (
    <div 
      className={cn(
        "bg-black border border-gray-800 rounded overflow-hidden flex flex-col min-h-0 min-w-0",
        className
      )}
      style={gridArea ? { gridArea } : undefined}
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

  // Get current price for liquidation heatmap
  const currentPrice = useMemo(() => {
    if (symbolData.trades.length > 0) {
      return symbolData.trades[0].price;
    }
    if (symbolData.orderBook?.bids?.[0] && symbolData.orderBook?.asks?.[0]) {
      return (symbolData.orderBook.bids[0].price + symbolData.orderBook.asks[0].price) / 2;
    }
    return 0;
  }, [symbolData.trades, symbolData.orderBook]);

  return (
    <div className="bento-dashboard">
      {/* ═══════════════════════════════════════════════════════════════════
          LEFT COLUMN: Time & Sales Tape
          ═══════════════════════════════════════════════════════════════════ */}
      <Panel gridArea="tape" className="tape-panel">
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

      {/* ═══════════════════════════════════════════════════════════════════
          CENTER TOP: Main Price/Volume Chart (expanded)
          ═══════════════════════════════════════════════════════════════════ */}
      {showCharts && (
        <Panel gridArea="chart" className="chart-panel">
          <PanelHeader title="PRICE / VOLUME / VWAP" color="text-cyan-500" />
          <div className="flex-1 overflow-hidden min-h-0">
            <ChartPanel
              trades={symbolData.trades}
              symbol={symbolData.symbol}
              width={800}
              compact={false}
            />
          </div>
        </Panel>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CENTER BOTTOM: Footprint + CVD
          ═══════════════════════════════════════════════════════════════════ */}
      <Panel gridArea="footprint" className="footprint-panel">
        <PanelHeader title="FOOTPRINT" color="text-purple-500" subtitle="BID × ASK" />
        <div className="flex-1 overflow-hidden min-h-0">
          <FootprintChart
            symbol={symbolData.symbol}
            trades={symbolData.trades}
          />
        </div>
      </Panel>

      <Panel gridArea="cvd" className="cvd-panel">
        <CVDOverlay 
          symbol={symbolData.symbol}
          height={100}
        />
      </Panel>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT TOP: Order Book + Imbalance Meter
          ═══════════════════════════════════════════════════════════════════ */}
      <Panel gridArea="orderbook" className="orderbook-panel">
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
              orderBook={symbolData.orderBook}
              levels={10}
              orientation="vertical"
              showLabels={true}
            />
          </div>
        </div>
      </Panel>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT MIDDLE: Volume Profile
          ═══════════════════════════════════════════════════════════════════ */}
      <Panel gridArea="profile" className="profile-panel">
        <PanelHeader title="VOLUME PROFILE" color="text-blue-500" subtitle="POC / VAH / VAL" />
        <div className="flex-1 overflow-hidden min-h-0">
          <VolumeProfile symbol={symbolData.symbol} compact={false} />
        </div>
      </Panel>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM LEFT: Tabbed Tools Panel (Analytics, News, Signals)
          With proper height for readability
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="tabbed-panel" style={{ gridArea: 'tools' }}>
        <TabbedToolsPanel symbol={symbolData.symbol} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM RIGHT: Quant Tools Stack (OI Monitor, Liquidation Heatmap)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="quant-panel" style={{ gridArea: 'quant' }}>
        <div className="flex flex-col gap-1 h-full">
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