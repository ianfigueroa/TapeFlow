/**
 * GridDashboard - React-Grid-Layout based dashboard for TapeFlow
 * 
 * This component replaces the static layout with a draggable/resizable grid.
 * Integrates all panels: tape, order book, charts, sentiment, news, volume profile, DOM.
 */

import { useCallback, useMemo, useState } from 'react';
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

interface GridDashboardProps {
  symbol: string;
  className?: string;
}

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
            {symbolData && (
              <AlgoSignals
                symbol={symbolData.symbol}
                velocitySpike={300}
                className="h-full"
              />
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
            {symbolData && (
              <OrderBook
                orderBook={symbolData.orderBook}
                assetType={symbolData.assetType}
                symbol={symbolData.symbol}
                showHeatmap={visualization.showHeatmap}
              />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('analysis-dashboard')) {
      result.push(
        <div key="analysis-dashboard">
          <GridPanel panelId="analysis-dashboard">
            {symbolData && (
              <AnalysisDashboard symbol={symbolData.symbol} />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('sentiment-panel')) {
      result.push(
        <div key="sentiment-panel">
          <GridPanel panelId="sentiment-panel">
            {symbolData && (
              <SentimentPanel
                symbol={symbolData.symbol}
                className="h-full"
              />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('news-feed')) {
      result.push(
        <div key="news-feed">
          <GridPanel panelId="news-feed">
            {symbolData && (
              <NewsFeed
                symbol={symbolData.symbol}
                className="h-full"
              />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('volume-profile')) {
      result.push(
        <div key="volume-profile">
          <GridPanel panelId="volume-profile">
            {symbolData && (
              <VolumeProfile
                symbol={symbolData.symbol}
                className="h-full"
              />
            )}
          </GridPanel>
        </div>
      );
    }
    
    if (isPanelVisible('dom-ladder')) {
      result.push(
        <div key="dom-ladder">
          <GridPanel panelId="dom-ladder">
            {symbolData && (
              <DOMLadder
                symbol={symbolData.symbol}
                className="h-full"
              />
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
