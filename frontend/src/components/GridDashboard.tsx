/**
 * GridDashboard - React-Grid-Layout based dashboard for TapeFlow
 * 
 * This component replaces the static layout with a draggable/resizable grid.
 * Integrates all panels: tape, order book, charts, sentiment, news, volume profile, DOM.
 */

import { useCallback, useMemo, useState, memo } from 'react';
import { DashboardGrid } from './layout/DashboardGrid';
import { GridPanel } from './layout/GridPanel';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useMarketStore } from '../stores/useMarketStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { TapeTable } from './TapeTable';
import { OrderBook } from './OrderBook';
import { AlgoSignals } from './AlgoSignals';
import { ChartPanel } from './ChartPanel';
import { AnalysisDashboard } from './dashboard';
import { SentimentPanel } from './SentimentPanel';
import { NewsFeed } from './NewsFeed';
import { VolumeProfile } from './VolumeProfile';
import { DOMLadder } from './DOMLadder';
import { cn } from '../lib/utils';
import type { PanelId } from '../types/layout';

// Skeleton loader component for empty states
const SkeletonLoader = memo(function SkeletonLoader({ 
  title, 
  lines = 5,
  showHeader = true 
}: { 
  title: string; 
  lines?: number;
  showHeader?: boolean;
}) {
  return (
    <div className="h-full w-full bg-black p-3 font-mono animate-pulse">
      {showHeader && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-gray-800" />
          <span className="text-gray-700 text-xs uppercase tracking-wider">{title}</span>
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i} 
            className="h-3 bg-gray-900 rounded"
            style={{ width: `${60 + Math.random() * 35}%`, opacity: 1 - (i * 0.1) }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-gray-700 text-xs">&gt; Awaiting data...</span>
      </div>
    </div>
  );
});

// Empty state wrapper for consistent styling
const EmptyPanel = memo(function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="h-full w-full bg-black flex items-center justify-center relative overflow-hidden">
      <SkeletonLoader title={title} />
    </div>
  );
});

interface GridDashboardProps {
  symbol: string;
  className?: string;
}

export function GridDashboard({ symbol, className }: GridDashboardProps) {
  const [isPaused, setIsPaused] = useState(false);
  
  // Get symbol data from store
  const symbolData = useMarketStore((state) => state.symbols.get(symbol));
  const pauseScroll = useMarketStore((state) => state.settings.pauseScroll);
  const hiddenPanels = useLayoutStore((state) => state.hiddenPanels);
  const visualization = useSettingsStore((state) => state.visualization);
  
  // Pause data flow during drag
  const handleDragStart = useCallback(() => {
    setIsPaused(true);
  }, []);
  
  const handleDragStop = useCallback(() => {
    setIsPaused(false);
  }, []);
  
  // Memoize panel visibility
  const isPanelVisible = useCallback((panelId: PanelId) => {
    return !hiddenPanels.includes(panelId);
  }, [hiddenPanels]);
  
  // Build panels based on visibility settings
  const panels = useMemo(() => {
    const result: JSX.Element[] = [];
    
    if (isPanelVisible('tape-table')) {
      result.push(
        <div key="tape-table">
          <GridPanel panelId="tape-table">
            {symbolData ? (
              <TapeTable
                trades={symbolData.trades}
                assetType={symbolData.assetType}
                symbol={symbolData.symbol}
                pauseScroll={pauseScroll || isPaused}
                showAnalytics={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                Select a symbol
              </div>
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('algo-signals')) {
      result.push(
        <div key="algo-signals">
          <GridPanel panelId="algo-signals">
            {symbolData ? (
              <AlgoSignals
                symbol={symbolData.symbol}
                velocitySpike={300}
                className="h-full"
              />
            ) : (
              <EmptyPanel title="Algo Signals" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('tabbed-chart')) {
      result.push(
        <div key="tabbed-chart">
          <GridPanel panelId="tabbed-chart">
            {({ width }) => (
              symbolData ? (
                <ChartPanel
                  trades={symbolData.trades}
                  symbol={symbolData.symbol}
                  width={width}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                  Select a symbol
                </div>
              )
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('order-book')) {
      result.push(
        <div key="order-book">
          <GridPanel panelId="order-book">
            {symbolData ? (
              <OrderBook
                orderBook={symbolData.orderBook}
                assetType={symbolData.assetType}
                symbol={symbolData.symbol}
                showHeatmap={visualization.showHeatmap}
              />
            ) : (
              <EmptyPanel title="Order Book" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('analysis-dashboard')) {
      result.push(
        <div key="analysis-dashboard">
          <GridPanel panelId="analysis-dashboard">
            {symbolData ? (
              <AnalysisDashboard symbol={symbolData.symbol} />
            ) : (
              <EmptyPanel title="Analytics" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('sentiment-panel')) {
      result.push(
        <div key="sentiment-panel">
          <GridPanel panelId="sentiment-panel">
            {symbolData ? (
              <SentimentPanel
                symbol={symbolData.symbol}
                className="h-full"
              />
            ) : (
              <EmptyPanel title="Sentiment" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('news-feed')) {
      result.push(
        <div key="news-feed">
          <GridPanel panelId="news-feed">
            {symbolData ? (
              <NewsFeed
                symbol={symbolData.symbol}
                className="h-full"
              />
            ) : (
              <EmptyPanel title="News Feed" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('volume-profile')) {
      result.push(
        <div key="volume-profile">
          <GridPanel panelId="volume-profile">
            {symbolData ? (
              <VolumeProfile
                symbol={symbolData.symbol}
                className="h-full"
              />
            ) : (
              <EmptyPanel title="Volume Profile" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('dom-ladder')) {
      result.push(
        <div key="dom-ladder">
          <GridPanel panelId="dom-ladder">
            {symbolData ? (
              <DOMLadder
                symbol={symbolData.symbol}
                className="h-full"
              />
            ) : (
              <EmptyPanel title="DOM Ladder" />
            )}
          </GridPanel>
        </div>
      );
    }
    
    return result;
  }, [symbolData, pauseScroll, isPaused, isPanelVisible, visualization.showHeatmap]);
  
  return (
    <div className={cn("w-full h-full bg-black", className)}>
      <DashboardGrid
        onDragStart={handleDragStart}
        onDragStop={handleDragStop}
      >
        {panels}
      </DashboardGrid>
    </div>
  );
}
