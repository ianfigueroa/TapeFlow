// Main app shell - header, tabs, split pane layout with tape and order book

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { TapeTable } from './TapeTable';
import { OrderBook } from './OrderBook';
import { AlgoSignals } from './AlgoSignals';
import { SymbolSelector } from './SymbolSelector';
import { SymbolHeader } from './SymbolHeader';
import { SymbolTab } from './SymbolTab';
import { RealTimeClock } from './RealTimeClock';
import { ModeToggle, type DataMode } from './ModeToggle';
import { useMarketStore } from '../stores/useMarketStore';
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

export function DashboardLayout() {
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const currentSymbolData = selectedSymbol ? symbols.get(selectedSymbol) : null;
  const orderBookWidth = Math.min(Math.max(windowSize.width * 0.35, 400), 600);

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

            <div style={{ width: orderBookWidth }} className="p-2 flex-shrink-0 flex flex-col gap-2 h-full">
              {currentSymbolData ? (
                <>
                  <div className="flex-none" style={{ height: '30%', minHeight: '180px' }}>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Combined Tape Mode</span>
                <button
                  onClick={() => updateSettings({ combinedTape: !settings.combinedTape })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors",
                    settings.combinedTape ? "bg-blue-600" : "bg-gray-700"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 bg-white rounded-full transition-transform",
                    settings.combinedTape ? "translate-x-6" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-300">Pause Scroll</span>
                <button
                  onClick={() => updateSettings({ pauseScroll: !settings.pauseScroll })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors",
                    settings.pauseScroll ? "bg-yellow-600" : "bg-gray-700"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 bg-white rounded-full transition-transform",
                    settings.pauseScroll ? "translate-x-6" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-300">Max Trades in Memory</span>
                <select
                  value={settings.maxTrades}
                  onChange={(e) => updateSettings({ maxTrades: parseInt(e.target.value) })}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                >
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="mt-6 w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
