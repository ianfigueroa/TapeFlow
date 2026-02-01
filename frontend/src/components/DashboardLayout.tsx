// Main app shell - streamlined single-screen trading terminal

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { TradingDashboard } from './TradingDashboard';
import { SymbolSelector } from './SymbolSelector';
import { SymbolTab } from './SymbolTab';
import { RealTimeClock } from './RealTimeClock';
import { ModeToggle, type DataMode } from './ModeToggle';
import { SettingsPanel } from './SettingsPanel';
import { PaperTradingPanel } from './controls/PaperTradingPanel';
import { ReplayControls } from './controls/ReplayControls';
import { useMarketStore } from '../stores/useMarketStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { SimulationAdapter } from '../adapters';

// Icons
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

export function DashboardLayout() {
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPaperTrading, setShowPaperTrading] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>('LIVE');
  const [simConnected, setSimConnected] = useState(false);
  const simAdapterRef = useRef<SimulationAdapter | null>(null);

  const { isConnected, connectionError, reconnect } = useWebSocket();
  
  const disconnect = useMarketStore((state) => state.disconnect);
  const connect = useMarketStore((state) => state.connect);
  const handleTrade = useMarketStore((state) => state._handleTrade);
  const handleOrderBook = useMarketStore((state) => state._handleOrderBook);

  const handleModeChange = useCallback(async (newMode: DataMode) => {
    if (newMode === dataMode) return;
    
    if (newMode === 'SIM') {
      disconnect();
      const adapter = new SimulationAdapter('ws://localhost:9001');
      try {
        await adapter.connect();
        const currentSymbol = useMarketStore.getState().selectedSymbol || 'BTCUSDT';
        adapter.setTargetSymbol(currentSymbol);
        adapter.onTrade((trade) => handleTrade(trade));
        adapter.onOrderBook((orderBook) => handleOrderBook(orderBook));
        simAdapterRef.current = adapter;
        setSimConnected(true);
        setDataMode('SIM');
      } catch {
        connect();
      }
    } else {
      if (simAdapterRef.current) {
        simAdapterRef.current.disconnect();
        simAdapterRef.current = null;
      }
      setSimConnected(false);
      setDataMode('LIVE');
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
  const clearTrades = useMarketStore((state) => state.clearTrades);

  useEffect(() => {
    if (dataMode === 'SIM' && simAdapterRef.current && selectedSymbol) {
      simAdapterRef.current.setTargetSymbol(selectedSymbol);
      clearTrades(selectedSymbol);
    }
  }, [selectedSymbol, dataMode, clearTrades]);

  const currentSymbolData = selectedSymbol ? symbols.get(selectedSymbol) : null;

  const handlePopout = useCallback((symbol: string) => {
    const url = `${window.location.origin}/popout/${symbol}`;
    window.open(url, `${symbol}_popout`, 'width=800,height=600,menubar=no,toolbar=no');
  }, []);

  return (
    <div className="h-screen flex flex-col bg-black text-white overflow-hidden">
      {/* Compact Header */}
      <header className="flex-shrink-0 bg-black border-b border-gray-800 px-3 py-1.5">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Status */}
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold font-mono text-[#00FF41]">TAPEFLOW</h1>
            
            <RealTimeClock />

            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono",
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
                ? (simConnected ? 'SIM' : 'OFF')
                : (isConnected ? 'LIVE' : 'OFF')
              }
            </div>

            <ModeToggle mode={dataMode} onChange={handleModeChange} />

            {connectionError && (
              <button onClick={reconnect} className="text-xs text-orange-500 hover:text-orange-400 font-mono">
                RECONNECT
              </button>
            )}
          </div>

          {/* Center: Tabs */}
          <div className="flex-1 flex items-center justify-center gap-1 mx-4 overflow-x-auto">
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
            {tabs.length > 0 && (
              <button
                onClick={() => setShowSymbolSelector(true)}
                className="p-1 text-gray-600 hover:text-[#00FF41] transition-colors"
              >
                <PlusIcon />
              </button>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateSettings({ pauseScroll: !settings.pauseScroll })}
              className={cn(
                "p-1.5 rounded border transition-colors",
                settings.pauseScroll
                  ? "border-orange-500 text-orange-500"
                  : "border-gray-800 text-gray-600 hover:text-gray-400"
              )}
              title={settings.pauseScroll ? "Resume" : "Pause"}
            >
              {settings.pauseScroll ? <PlayIcon /> : <PauseIcon />}
            </button>

            <button
              onClick={() => clearTrades()}
              className="p-1.5 rounded border border-gray-800 text-gray-600 hover:text-gray-400 transition-colors"
              title="Clear trades"
            >
              <TrashIcon />
            </button>

            <button
              onClick={() => setShowPaperTrading(!showPaperTrading)}
              className={cn(
                "p-1.5 rounded border transition-colors",
                showPaperTrading
                  ? "border-[#A855F7] text-[#A855F7]"
                  : "border-gray-800 text-gray-600 hover:text-gray-400"
              )}
              title="Paper Trading"
            >
              <DollarIcon />
            </button>

            <button
              onClick={() => setShowReplay(!showReplay)}
              className={cn(
                "p-1.5 rounded border transition-colors",
                showReplay
                  ? "border-cyan-500 text-cyan-500"
                  : "border-gray-800 text-gray-600 hover:text-gray-400"
              )}
              title="Replay"
            >
              <RewindIcon />
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded border border-gray-800 text-gray-600 hover:text-gray-400 transition-colors"
              title="Settings"
            >
              <SettingsIcon />
            </button>

            <button
              onClick={() => setShowSymbolSelector(true)}
              className="flex items-center gap-1 px-2 py-1 bg-black border border-[#00FF41] text-[#00FF41] rounded font-mono text-xs hover:bg-[#001100] transition-colors"
            >
              <PlusIcon />
              ADD
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {tabs.length === 0 ? (
          // Welcome screen
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-[#00FF41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h2v8H3zM9 9h2v12H9zM15 5h2v16h-2zM21 1h2v20h-2z" />
              </svg>
              <h2 className="text-lg font-mono text-[#00FF41] mb-2">TAPEFLOW</h2>
              <p className="text-gray-600 mb-4 font-mono text-sm">
                Professional crypto trading terminal
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
        ) : currentSymbolData ? (
          // Trading Dashboard
          <TradingDashboard 
            symbolData={currentSymbolData} 
            pauseScroll={settings.pauseScroll} 
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600 font-mono text-sm">
            Select a symbol
          </div>
        )}
      </main>

      {/* Modals */}
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
        <div className="fixed top-16 right-4 z-40">
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
          <ReplayControls symbol={currentSymbolData.symbol} className="w-72" />
        </div>
      )}
    </div>
  );
}
