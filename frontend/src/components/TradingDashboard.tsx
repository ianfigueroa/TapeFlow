/**
 * TradingDashboard - Professional single-screen trading terminal
 * 
 * Layout (3-column):
 * - Left: Tape + Analytics
 * - Center: Charts + Footprint + Heatmap
 * - Right: Order Book + Algo Signals + Volume Profile
 * 
 * Bottom bar: News ticker + Sentiment
 */

import { memo } from 'react';
import { cn } from '../lib/utils';
import { TapeTable } from './TapeTable';
import { OrderBook } from './OrderBook';
import { OrderBookHeatmap } from './OrderBookHeatmap';
import { AlgoSignals } from './AlgoSignals';
import { ChartPanel } from './ChartPanel';
import { FootprintChart } from './FootprintChart';
import { SentimentPanel } from './SentimentPanel';
import { NewsFeed } from './NewsFeed';
import { VolumeProfile } from './VolumeProfile';
import { AnalysisDashboard } from './dashboard/AnalysisDashboard';
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
    <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800 bg-gray-900/30">
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

// Panel wrapper
const Panel = memo(function Panel({ 
  children, 
  className
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn(
      "bg-black border border-gray-800 rounded overflow-hidden flex flex-col",
      className
    )}>
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

  // Calculate column widths
  const leftWidth = '22%';
  const centerWidth = '40%';
  const rightWidth = '38%';

  return (
    <div className="flex flex-col h-full bg-black gap-1 p-1">
      {/* Main 3-column layout */}
      <div className="flex-1 flex gap-1 min-h-0">
        
        {/* LEFT COLUMN: Tape + Analytics */}
        <div className="flex flex-col gap-1" style={{ width: leftWidth }}>
          {/* Time & Sales Tape */}
          <Panel className="flex-1 min-h-0">
            <PanelHeader 
              title="TIME & SALES" 
              color="text-[#00FF41]"
              subtitle={`${symbolData.trades.length} trades`}
            />
            <div className="flex-1 overflow-hidden">
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

          {/* Analytics Dashboard */}
          <Panel className="h-[180px] flex-shrink-0">
            <PanelHeader title="ANALYTICS" color="text-emerald-500" />
            <div className="flex-1 overflow-hidden p-1">
              <AnalysisDashboard symbol={symbolData.symbol} compact={true} />
            </div>
          </Panel>
        </div>

        {/* CENTER COLUMN: Charts + Footprint + Heatmap */}
        <div className="flex flex-col gap-1" style={{ width: centerWidth }}>
          {/* Price Charts */}
          {showCharts && (
            <Panel className="h-[200px] flex-shrink-0">
              <PanelHeader title="PRICE" color="text-cyan-500" />
              <div className="flex-1 overflow-hidden">
                <ChartPanel
                  trades={symbolData.trades}
                  symbol={symbolData.symbol}
                  width={500}
                  compact={true}
                />
              </div>
            </Panel>
          )}

          {/* Footprint Chart */}
          <Panel className="flex-1 min-h-[200px]">
            <PanelHeader title="FOOTPRINT" color="text-purple-500" subtitle="BID x ASK" />
            <div className="flex-1 overflow-hidden">
              <FootprintChart
                symbol={symbolData.symbol}
                trades={symbolData.trades}
              />
            </div>
          </Panel>

          {/* Order Book Heatmap */}
          {visualization.showHeatmap && (
            <Panel className="h-[180px] flex-shrink-0">
              <PanelHeader title="DEPTH HEATMAP" color="text-yellow-500" />
              <div className="flex-1 overflow-hidden p-1">
                <OrderBookHeatmap
                  symbol={symbolData.symbol}
                  height={140}
                />
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT COLUMN: Order Book + Signals + Volume Profile */}
        <div className="flex flex-col gap-1" style={{ width: rightWidth }}>
          {/* Order Book */}
          <Panel className="flex-1 min-h-[250px]">
            <PanelHeader 
              title="ORDER BOOK" 
              color="text-orange-500"
              subtitle="L2 Depth"
            />
            <div className="flex-1 overflow-hidden">
              <OrderBook
                orderBook={symbolData.orderBook}
                assetType={symbolData.assetType}
                symbol={symbolData.symbol}
                showHeatmap={true}
                maxLevels={12}
              />
            </div>
          </Panel>

          {/* Algo Signals */}
          <Panel className="h-[160px] flex-shrink-0">
            <PanelHeader title="ALGO SIGNALS" color="text-[#00FF41]" />
            <div className="flex-1 overflow-hidden">
              <AlgoSignals
                symbol={symbolData.symbol}
                velocitySpike={300}
                compact={true}
              />
            </div>
          </Panel>

          {/* Volume Profile */}
          <Panel className="h-[180px] flex-shrink-0">
            <PanelHeader title="VOLUME PROFILE" color="text-blue-500" subtitle="POC / VAH / VAL" />
            <div className="flex-1 overflow-hidden">
              <VolumeProfile symbol={symbolData.symbol} compact={true} />
            </div>
          </Panel>
        </div>
      </div>

      {/* BOTTOM BAR: News + Sentiment */}
      <div className="h-[100px] flex gap-1 flex-shrink-0">
        {/* News Ticker */}
        <Panel className="flex-1">
          <PanelHeader title="NEWS" color="text-blue-400" />
          <div className="flex-1 overflow-hidden">
            <NewsFeed symbol={symbolData.symbol} compact={true} />
          </div>
        </Panel>

        {/* Sentiment */}
        <Panel className="w-[280px] flex-shrink-0">
          <PanelHeader title="SENTIMENT" color="text-[#00FF41]" />
          <div className="flex-1 overflow-hidden">
            <SentimentPanel symbol={symbolData.symbol} compact={true} />
          </div>
        </Panel>
      </div>
    </div>
  );
});

export default TradingDashboard;
