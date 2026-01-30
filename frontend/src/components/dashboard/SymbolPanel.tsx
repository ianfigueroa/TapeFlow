import { useCallback } from 'react';
import { TapeTable } from '../TapeTable';
import { OrderBook } from '../OrderBook';
import { OrderBookHeatmap } from '../OrderBookHeatmap';
import { AlgoSignals } from '../AlgoSignals';
import { ChartPanel } from '../ChartPanel';
import { SymbolHeader } from '../SymbolHeader';
import { useMarketStore } from '../../stores/useMarketStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

interface SymbolPanelProps {
  symbol: string;
  width: number;
  height: number;
  compact?: boolean;
}

export function SymbolPanel({ symbol, width, height, compact = false }: SymbolPanelProps) {
  const symbolData = useMarketStore(
    useCallback((state) => state.symbols.get(symbol), [symbol])
  );
  const settings = useMarketStore((state) => state.settings);
  const visualization = useSettingsStore((state) => state.visualization);

  if (!symbolData) {
    return (
      <div
        className="flex items-center justify-center text-gray-600 font-mono text-sm bg-black border border-gray-800 rounded"
        style={{ width, height }}
      >
        Loading {symbol}...
      </div>
    );
  }

  const showCharts = visualization.showPriceChart || visualization.showVolumeChart || visualization.showDeltaChart;
  const tapeWidth = compact ? width : Math.floor(width * 0.55);
  const sidebarWidth = compact ? width : width - tapeWidth - 8;

  if (compact) {
    return (
      <div
        className="flex flex-col bg-black border border-gray-800 rounded overflow-hidden"
        style={{ width, height }}
      >
        <SymbolHeader
          symbol={symbolData.symbol}
          name={symbolData.name}
          assetType={symbolData.assetType}
          lastPrice={symbolData.lastPrice}
        />
        <div className="flex-1 overflow-hidden">
          <TapeTable
            trades={symbolData.trades}
            assetType={symbolData.assetType}
            symbol={symbolData.symbol}
            pauseScroll={settings.pauseScroll}
            showAnalytics={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2" style={{ width, height }}>
      <div
        className="flex flex-col bg-black border border-gray-800 rounded overflow-hidden"
        style={{ width: tapeWidth, height }}
      >
        <SymbolHeader
          symbol={symbolData.symbol}
          name={symbolData.name}
          assetType={symbolData.assetType}
          lastPrice={symbolData.lastPrice}
        />
        <div className="flex-1 overflow-hidden">
          <TapeTable
            trades={symbolData.trades}
            assetType={symbolData.assetType}
            symbol={symbolData.symbol}
            pauseScroll={settings.pauseScroll}
            showAnalytics={true}
          />
        </div>
      </div>

      <div
        className="flex flex-col gap-2 overflow-y-auto"
        style={{ width: sidebarWidth, height }}
      >
        {showCharts && (
          <ChartPanel
            trades={symbolData.trades}
            symbol={symbolData.symbol}
            width={sidebarWidth - 4}
          />
        )}

        {visualization.showHeatmap && (
          <div className="bg-black rounded border border-gray-800 p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-500 uppercase">
                Order Book Heatmap
              </span>
            </div>
            <OrderBookHeatmap
              symbol={symbolData.symbol}
              width={sidebarWidth - 20}
              height={140}
            />
          </div>
        )}

        <AlgoSignals
          symbol={symbolData.symbol}
          velocitySpike={300}
          className="flex-none"
          style={{ height: 120 }}
        />

        <div
          className="flex-1 bg-black rounded border border-gray-800 overflow-hidden flex flex-col"
          style={{ minHeight: 200 }}
        >
          <div className="p-2 border-b border-gray-800">
            <h2 className="text-sm font-mono text-orange-500">&gt;&gt; ORDER BOOK</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <OrderBook
              orderBook={symbolData.orderBook}
              assetType={symbolData.assetType}
              symbol={symbolData.symbol}
              showHeatmap={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
