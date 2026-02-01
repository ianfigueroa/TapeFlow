// Main app shell - header, tabs, split pane layout with tape and order book

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { TapeTable } from './TapeTable';
import { OrderBook } from './OrderBook';
import { OrderBookHeatmap } from './OrderBookHeatmap';
import { AlgoSignals } from './AlgoSignals';
import { SymbolSelector } from './SymbolSelector';
import { SymbolHeader } from './SymbolHeader';
import { SymbolTab } from './SymbolTab';
import { RealTimeClock } from './RealTimeClock';
import { ModeToggle, type DataMode } from './ModeToggle';
import { SettingsPanel } from './SettingsPanel';
import { ChartPanel } from './ChartPanel';
import { PaperTradingPanel } from './controls/PaperTradingPanel';
import { ReplayControls } from './controls/ReplayControls';
import { SentimentPanel } from './SentimentPanel';
import { NewsFeed } from './NewsFeed';
import { VolumeProfile } from './VolumeProfile';
import { AnalysisDashboard } from './dashboard/AnalysisDashboard';
import { useMarketStore } from '../stores/useMarketStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { SimulationAdapter } from '../adapters';

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CombineIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DollarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const RewindIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
  </svg>
);

const NewsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
  </svg>
);

const ChartBarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

export function DashboardLayout() {
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPaperTrading, setShowPaperTrading] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [showSentiment, setShowSentiment] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [dataMode, setDataMode] = useState<DataMode>('LIVE');
  const [simConnected, setSimConnected] = useState(false);
  const simAdapterRef = useRef<SimulationAdapter | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('focus', handleResize);

    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleResize);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) setTimeout(handleResize, 100);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleResize);
      }
    };
  }, []);

  const { isConnected, connectionError, reconnect } = useWebSocket();
  
  // Get store actions for injecting simulation data
  const disconnect = useMarketStore((state) => state.disconnect);
  const connect = useMarketStore((state) => state.connect);
  const handleTrade = useMarketStore((state) => state._handleTrade);
  const handleOrderBook = useMarketStore((state) => state._handleOrderBook);

  // Handle mode switching between Live and Simulation
  const handleModeChange = useCallback(async (newMode: DataMode) => {
    if (newMode === dataMode) return;
    
    if (newMode === 'SIM') {
      // Disconnect from Live WebSocket
      disconnect();
      
      // Switch to simulation mode
      const adapter = new SimulationAdapter('ws://localhost:9001');
      try {
        await adapter.connect();
        
        // Set target symbol to currently selected symbol (or BTCUSDT default)
        const currentSymbol = useMarketStore.getState().selectedSymbol || 'BTCUSDT';
        adapter.setTargetSymbol(currentSymbol);
        
        // Wire up callbacks to inject simulation data into store
        adapter.onTrade((trade) => {
          handleTrade(trade);
        });
        
        adapter.onOrderBook((orderBook) => {
          handleOrderBook(orderBook);
        });
        
        simAdapterRef.current = adapter;
        setSimConnected(true);
        setDataMode('SIM');
      } catch (error) {
        console.error('Failed to connect to simulation engine:', error);
        alert('Failed to connect to Hyperion Engine. Make sure it\'s running on port 9001.');
        // Reconnect to Live if SIM fails
        connect();
      }
    } else {
      // Switch back to live mode
      if (simAdapterRef.current) {
        simAdapterRef.current.disconnect();
        simAdapterRef.current = null;
      }
      setSimConnected(false);
      setDataMode('LIVE');
      // Reconnect to Live WebSocket
      connect();
    }
  }, [dataMode, disconnect, connect, handleTrade, handleOrderBook]);

  const symbols = useMarketStore((state) => state.symbols);
  const tabs = useMarketStore((state) => state.tabs);
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const selectSymbol = useMarketStore((state) => state.selectSymbol);
  const removeTab = useMarketStore((state) => state.removeTab);
  const settings = useMarketStore((state) => state.settings);
  const updateSettings = useMarketStore((state) => state.updateSettings);
  const combinedTrades = useMarketStore((state) => state.combinedTrades);
  const clearTrades = useMarketStore((state) => state.clearTrades);

  // Update sim adapter target symbol when selected symbol changes
  useEffect(() => {
    if (dataMode === 'SIM' && simAdapterRef.current && selectedSymbol) {
      simAdapterRef.current.setTargetSymbol(selectedSymbol);
      // Clear trades for the new symbol so we start fresh
      clearTrades(selectedSymbol);
    }
  }, [selectedSymbol, dataMode, clearTrades]);

  const currentSymbolData = selectedSymbol ? symbols.get(selectedSymbol) : null;
  const orderBookWidth = Math.min(Math.max(windowSize.width * 0.35, 400), 600);
  const visualization = useSettingsStore((state) => state.visualization);
  const showCharts = visualization.showPriceChart || visualization.showVolumeChart || visualization.showDeltaChart;

  const handlePopout = useCallback((symbol: string) => {
    const url = `${window.location.origin}/popout/${symbol}`;
    window.open(url, `${symbol}_popout`, 'width=800,height=600,menubar=no,toolbar=no');
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-black border-b border-gray-800 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold font-mono text-[#00FF41]">TAPEFLOW</h1>

            <div className="border-l border-gray-800 pl-4">
              <RealTimeClock />
            </div>

            <div className={cn(
              "flex items-center gap-2 px-2 py-1 rounded text-xs font-mono",
              dataMode === 'SIM' 
                ? (simConnected ? "text-[#A855F7]" : "text-gray-500")
                : (isConnected ? "text-[#00FF41]" : "text-[#FF4545]")
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                dataMode === 'SIM'
                  ? (simConnected ? "bg-[#A855F7]" : "bg-gray-500")
                  : (isConnected ? "bg-[#00FF41]" : "bg-[#FF4545]")
              )} />
              {dataMode === 'SIM' 
                ? (simConnected ? 'HYPERION' : 'OFFLINE')
                : (isConnected ? 'LIVE' : 'OFFLINE')
              }
            </div>

            <ModeToggle 
              mode={dataMode} 
              onChange={handleModeChange}
            />

            {connectionError && (
              <button onClick={reconnect} className="text-xs text-orange-500 hover:text-orange-400 font-mono">
                [RECONNECT]
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => updateSettings({ combinedTape: !settings.combinedTape })}
              className={cn(
                "p-2 rounded border transition-colors",
                settings.combinedTape
                  ? "bg-black border-[#00FF41] text-[#00FF41]"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="Combine all tapes"
            >
              <CombineIcon />
            </button>

            <button
              onClick={() => updateSettings({ pauseScroll: !settings.pauseScroll })}
              className={cn(
                "p-2 rounded border transition-colors",
                settings.pauseScroll
                  ? "bg-black border-orange-500 text-orange-500"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title={settings.pauseScroll ? "Resume scrolling" : "Pause scrolling"}
            >
              {settings.pauseScroll ? <PlayIcon /> : <PauseIcon />}
            </button>

            <button
              onClick={() => clearTrades()}
              className="p-2 rounded border bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700 transition-colors"
              title="Clear all trades"
            >
              <XIcon />
            </button>

            <button
              onClick={() => setShowPaperTrading(!showPaperTrading)}
              className={cn(
                "p-2 rounded border transition-colors",
                showPaperTrading
                  ? "bg-black border-[#A855F7] text-[#A855F7]"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="Paper Trading"
            >
              <DollarIcon />
            </button>

            <button
              onClick={() => setShowReplay(!showReplay)}
              className={cn(
                "p-2 rounded border transition-colors",
                showReplay
                  ? "bg-black border-cyan-500 text-cyan-500"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="Replay Controls"
            >
              <RewindIcon />
            </button>

            <div className="w-px h-6 bg-gray-800 mx-1" />

            <button
              onClick={() => setShowSentiment(!showSentiment)}
              className={cn(
                "p-2 rounded border transition-colors",
                showSentiment
                  ? "bg-black border-[#00FF41] text-[#00FF41]"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="Sentiment Panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </button>

            <button
              onClick={() => setShowNews(!showNews)}
              className={cn(
                "p-2 rounded border transition-colors",
                showNews
                  ? "bg-black border-blue-500 text-blue-500"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="News Feed"
            >
              <NewsIcon />
            </button>

            <button
              onClick={() => setShowVolumeProfile(!showVolumeProfile)}
              className={cn(
                "p-2 rounded border transition-colors",
                showVolumeProfile
                  ? "bg-black border-yellow-500 text-yellow-500"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="Volume Profile"
            >
              <ChartBarIcon />
            </button>

            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={cn(
                "p-2 rounded border transition-colors",
                showAnalytics
                  ? "bg-black border-emerald-500 text-emerald-500"
                  : "bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700"
              )}
              title="Analytics Dashboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>

            <div className="w-px h-6 bg-gray-800 mx-1" />

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded border bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700 transition-colors"
              title="Settings"
            >
              <SettingsIcon />
            </button>

            <button
              onClick={() => setShowSymbolSelector(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-black border border-[#00FF41] text-[#00FF41] rounded font-mono text-sm hover:bg-[#001100] transition-colors"
            >
              <PlusIcon />
              ADD
            </button>
          </div>
        </div>
      </header>

      {tabs.length > 0 && (
        <div className="bg-black border-b border-gray-800 px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {tabs.map((tab) => (
              <SymbolTab
                key={tab.symbol}
                symbol={tab.symbol}
                assetType={tab.assetType}
                isActive={selectedSymbol === tab.symbol}
                onClick={() => selectSymbol(tab.symbol)}
                onClose={() => removeTab(tab.symbol)}
                onPopout={() => handlePopout(tab.symbol)}
              />
            ))}
            <button
              onClick={() => setShowSymbolSelector(true)}
              className="p-1.5 text-gray-600 hover:text-[#00FF41] transition-colors"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      )}

      <main className="flex flex-1 bg-black" style={{ height: 'calc(100vh - 120px)' }}>
        {tabs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-black">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-[#00FF41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h2v8H3zM9 9h2v12H9zM15 5h2v16h-2zM21 1h2v20h-2z" />
              </svg>
              <h2 className="text-xl font-mono text-[#00FF41] mb-2">&gt; TAPEFLOW</h2>
              <p className="text-gray-600 mb-6 max-w-md font-mono text-sm">
                Real-time crypto tape with L2 depth visualization
              </p>
              <button
                onClick={() => setShowSymbolSelector(true)}
                className="flex items-center gap-2 px-4 py-2 bg-black border border-[#00FF41] text-[#00FF41] rounded font-mono text-sm hover:bg-[#001100] transition-colors mx-auto"
              >
                <PlusIcon />
                ADD SYMBOL
              </button>
            </div>
          </div>
        ) : settings.combinedTape ? (
          <div className="flex-1 p-2 bg-black">
            <div className="bg-black rounded border border-gray-800 h-full overflow-hidden">
              <div className="p-3 border-b border-gray-800">
                <h2 className="text-sm font-mono text-orange-500">&gt;&gt; COMBINED TAPE</h2>
                <p className="text-xs text-gray-600 font-mono">All symbols merged</p>
              </div>
              <TapeTable
                trades={combinedTrades}
                assetType="crypto"
                pauseScroll={settings.pauseScroll}
                showAnalytics={true}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex bg-black">
            <div className="flex-1 p-2 border-r border-gray-800">
              {currentSymbolData ? (
                <div className="bg-black rounded border border-gray-800 h-full overflow-hidden flex flex-col">
                  <SymbolHeader
                    symbol={currentSymbolData.symbol}
                    name={currentSymbolData.name}
                    assetType={currentSymbolData.assetType}
                    lastPrice={currentSymbolData.lastPrice}
                  />
                  <div className="flex-1 overflow-hidden">
                    <TapeTable
                      trades={currentSymbolData.trades}
                      assetType={currentSymbolData.assetType}
                      symbol={currentSymbolData.symbol}
                      pauseScroll={settings.pauseScroll}
                      showAnalytics={true}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-600 font-mono text-sm">
                  &gt; Select a symbol
                </div>
              )}
            </div>

            <div style={{ width: orderBookWidth }} className="p-2 flex-shrink-0 flex flex-col gap-2 h-full overflow-y-auto">
              {currentSymbolData ? (
                <>
                  {showCharts && (
                    <ChartPanel
                      trades={currentSymbolData.trades}
                      symbol={currentSymbolData.symbol}
                      width={orderBookWidth - 16}
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
                        symbol={currentSymbolData.symbol}
                        width={orderBookWidth - 32}
                        height={180}
                      />
                    </div>
                  )}
                  <div className="flex-none" style={{ height: showCharts ? '20%' : '30%', minHeight: '150px' }}>
                    <AlgoSignals
                      symbol={currentSymbolData.symbol}
                      velocitySpike={300}
                      className="h-full"
                    />
                  </div>
                  <div className="flex-1 bg-black rounded border border-gray-800 overflow-hidden flex flex-col" style={{ minHeight: '350px' }}>
                    <div className="p-2 border-b border-gray-800">
                      <h2 className="text-sm font-mono text-orange-500">&gt;&gt; ORDER BOOK</h2>
                      <p className="text-xs text-gray-600 font-mono">
                        {currentSymbolData.assetType === 'crypto' ? 'L2 Depth' : 'Quote approximation'}
                      </p>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <OrderBook
                        orderBook={currentSymbolData.orderBook}
                        assetType={currentSymbolData.assetType}
                        symbol={currentSymbolData.symbol}
                        showHeatmap={true}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-600 font-mono text-sm">
                  &gt; Select a symbol
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showSymbolSelector && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <SymbolSelector onClose={() => setShowSymbolSelector(false)} />
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      )}

      {showPaperTrading && currentSymbolData && (
        <div className="fixed top-24 right-4 z-40">
          <PaperTradingPanel
            symbol={currentSymbolData.symbol}
            currentPrice={currentSymbolData.lastPrice}
            bestBid={currentSymbolData.orderBook?.bids[0]?.price || 0}
            bestAsk={currentSymbolData.orderBook?.asks[0]?.price || 0}
            onClose={() => setShowPaperTrading(false)}
          />
        </div>
      )}

      {showReplay && currentSymbolData && (
        <div className="fixed bottom-4 left-4 z-40">
          <ReplayControls
            symbol={currentSymbolData.symbol}
            className="w-80"
          />
        </div>
      )}

      {showSentiment && currentSymbolData && (
        <div className="fixed top-24 left-4 z-40">
          <div className="bg-black border border-gray-800 rounded-lg shadow-xl">
            <div className="flex items-center justify-between p-2 border-b border-gray-800">
              <span className="text-xs font-mono text-[#00FF41]">SENTIMENT</span>
              <button
                onClick={() => setShowSentiment(false)}
                className="text-gray-600 hover:text-white"
              >
                <XIcon />
              </button>
            </div>
            <SentimentPanel symbol={currentSymbolData.symbol} />
          </div>
        </div>
      )}

      {showNews && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 max-h-[70vh] overflow-hidden">
          <div className="bg-black border border-gray-800 rounded-lg shadow-xl">
            <div className="flex items-center justify-between p-2 border-b border-gray-800">
              <span className="text-xs font-mono text-blue-500">NEWS FEED</span>
              <button
                onClick={() => setShowNews(false)}
                className="text-gray-600 hover:text-white"
              >
                <XIcon />
              </button>
            </div>
            <NewsFeed symbol={selectedSymbol || 'BTC'} />
          </div>
        </div>
      )}

      {showVolumeProfile && currentSymbolData && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="bg-black border border-gray-800 rounded-lg shadow-xl">
            <div className="flex items-center justify-between p-2 border-b border-gray-800">
              <span className="text-xs font-mono text-yellow-500">VOLUME PROFILE</span>
              <button
                onClick={() => setShowVolumeProfile(false)}
                className="text-gray-600 hover:text-white"
              >
                <XIcon />
              </button>
            </div>
            <VolumeProfile symbol={currentSymbolData.symbol} />
          </div>
        </div>
      )}

      {showAnalytics && currentSymbolData && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-black border border-gray-800 rounded-lg shadow-xl">
            <div className="flex items-center justify-between p-2 border-b border-gray-800">
              <span className="text-xs font-mono text-emerald-500">ANALYTICS</span>
              <button
                onClick={() => setShowAnalytics(false)}
                className="text-gray-600 hover:text-white"
              >
                <XIcon />
              </button>
            </div>
            <AnalysisDashboard symbol={currentSymbolData.symbol} />
          </div>
        </div>
      )}
    </div>
  );
}
