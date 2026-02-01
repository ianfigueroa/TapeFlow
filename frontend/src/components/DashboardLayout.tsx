// Main app shell - streamlined single-screen trading terminal

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { TapeFlowWorkspace } from './TapeFlowWorkspace';
import { SymbolSelector } from './SymbolSelector';
import { QuickSymbolSelector } from './QuickSymbolSelector';
import { SymbolTab } from './SymbolTab';
import { RealTimeClock } from './RealTimeClock';
import { ModeToggle, type DataMode } from './ModeToggle';
import { ThemeToggle } from './ThemeToggle';
import { SettingsPanel } from './SettingsPanel';
import { HotkeysPanel } from './HotkeysPanel';
import { AlertsPanel, AlertToastContainer } from './AlertsPanel';
import { useMarketStore } from '../stores/useMarketStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTheme } from '../hooks/useTheme';
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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const HelpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

export function DashboardLayout() {
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>('LIVE');
  const [simConnected, setSimConnected] = useState(false);
  const simAdapterRef = useRef<SimulationAdapter | null>(null);

  const { isConnected, connectionError, reconnect } = useWebSocket();
  const { isHacker } = useTheme();
  
  // Theme-aware colors
  const accentColor = isHacker ? '#00FF00' : '#58a6ff';
  const sellColor = isHacker ? '#FF0000' : '#f85149';
  
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // ? or Shift+/ - Show hotkeys panel
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowHotkeys(prev => !prev);
        return;
      }
      
      // Escape - Close all modals
      if (e.key === 'Escape') {
        setShowSymbolSelector(false);
        setShowSettings(false);
        setShowHotkeys(false);
        setShowAlerts(false);
        return;
      }
      
      // Space - Pause/Resume
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        updateSettings({ pauseScroll: !settings.pauseScroll });
        return;
      }
      
      // Ctrl+1-9 - Switch tabs
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabs[tabIndex]) {
          selectSymbol(tabs[tabIndex].symbol);
        }
        return;
      }
      
      // Ctrl+N - Add symbol
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setShowSymbolSelector(true);
        return;
      }
      
      // Ctrl+W - Close current tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (selectedSymbol) {
          removeTab(selectedSymbol);
        }
        return;
      }
      
      // G - Toggle settings
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        setShowSettings(prev => !prev);
        return;
      }
      
      // A - Toggle alerts
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
        setShowAlerts(prev => !prev);
        return;
      }
      
      // R - Clear trades
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        clearTrades();
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.pauseScroll, updateSettings, tabs, selectSymbol, selectedSymbol, removeTab, clearTrades]);

  const handlePopout = useCallback((symbol: string) => {
    const url = `${window.location.origin}/popout/${symbol}`;
    window.open(url, `${symbol}_popout`, 'width=800,height=600,menubar=no,toolbar=no');
  }, []);

  return (
    <div className="h-screen flex flex-col tf-bg-primary text-white overflow-hidden" style={{ backgroundColor: 'var(--tf-bg-primary)' }}>
      {/* Persistent Top Navigation - Always visible, z-index 100 to stay above flexlayout */}
      <header className="flex-shrink-0 border-b px-3 py-1.5 relative z-[100]" style={{ backgroundColor: 'var(--tf-bg-secondary)', borderColor: 'var(--tf-border-primary)' }}>
        <div className="flex items-center justify-between">
          {/* Left: Logo + Symbol Selector + Status */}
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold font-mono" style={{ color: accentColor, textShadow: isHacker ? '0 0 10px rgba(0,255,0,0.5)' : 'none' }}>
              TAPEFLOW
            </h1>
            
            {/* Quick Symbol Selector */}
            <QuickSymbolSelector />
            
            <RealTimeClock />

            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono",
              dataMode === 'SIM' 
                ? (simConnected ? "text-[#A855F7]" : "text-gray-500")
                : (isConnected ? "" : "")
            )} style={{ color: dataMode === 'SIM' ? (simConnected ? '#A855F7' : '#666') : (isConnected ? accentColor : sellColor) }}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full"
              )} style={{ backgroundColor: dataMode === 'SIM' ? (simConnected ? '#A855F7' : '#666') : (isConnected ? accentColor : sellColor) }} />
              {dataMode === 'SIM' 
                ? (simConnected ? 'SIM' : 'OFF')
                : (isConnected ? 'LIVE' : 'OFF')
              }
            </div>

            <ModeToggle mode={dataMode} onChange={handleModeChange} />
            
            <ThemeToggle />

            {connectionError && (
              <button onClick={reconnect} className="text-xs hover:opacity-80 font-mono" style={{ color: 'var(--tf-accent-warning)' }}>
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
                  ? ""
                  : "text-gray-600 hover:text-gray-400"
              )}
              style={{
                borderColor: settings.pauseScroll ? 'var(--tf-accent-warning)' : 'var(--tf-border-primary)',
                color: settings.pauseScroll ? 'var(--tf-accent-warning)' : undefined
              }}
              title={settings.pauseScroll ? "Resume" : "Pause"}
            >
              {settings.pauseScroll ? <PlayIcon /> : <PauseIcon />}
            </button>

            <button
              onClick={() => clearTrades()}
              className="p-1.5 rounded border text-gray-600 hover:text-gray-400 transition-colors"
              style={{ borderColor: 'var(--tf-border-primary)' }}
              title="Clear trades"
            >
              <TrashIcon />
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded border text-gray-600 hover:text-gray-400 transition-colors"
              style={{ borderColor: 'var(--tf-border-primary)' }}
              title="Settings"
            >
              <SettingsIcon />
            </button>

            <button
              onClick={() => setShowHotkeys(true)}
              className="p-1.5 rounded border text-gray-600 hover:text-gray-400 transition-colors"
              style={{ borderColor: 'var(--tf-border-primary)' }}
              title="Keyboard Shortcuts (?)"
            >
              <HelpIcon />
            </button>

            <button
              onClick={() => setShowAlerts(true)}
              className={cn(
                "p-1.5 rounded border transition-colors",
                showAlerts
                  ? "border-[#00FF41] text-[#00FF41]"
                  : "text-gray-600 hover:text-gray-400"
              )}
              style={{ borderColor: showAlerts ? '#00FF41' : 'var(--tf-border-primary)' }}
              title="Alerts (A)"
            >
              <BellIcon />
            </button>

            <button
              onClick={() => setShowSymbolSelector(true)}
              className="flex items-center gap-1 px-2 py-1 rounded font-mono text-xs transition-colors"
              style={{ 
                backgroundColor: 'var(--tf-bg-primary)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: accentColor,
                color: accentColor
              }}
            >
              <PlusIcon />
              ADD
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - fills remaining height */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {tabs.length === 0 ? (
          // Welcome screen
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h2v8H3zM9 9h2v12H9zM15 5h2v16h-2zM21 1h2v20h-2z" />
              </svg>
              <h2 className="text-lg font-mono mb-2" style={{ color: accentColor, textShadow: isHacker ? '0 0 15px rgba(0,255,0,0.5)' : 'none' }}>
                TAPEFLOW
              </h2>
              <p className="mb-4 font-mono text-sm" style={{ color: 'var(--tf-text-muted)' }}>
                Professional crypto trading terminal
              </p>
              <button
                onClick={() => setShowSymbolSelector(true)}
                className="flex items-center gap-2 px-4 py-2 rounded font-mono text-sm transition-colors mx-auto"
                style={{ 
                  backgroundColor: 'var(--tf-bg-primary)',
                  border: `1px solid ${accentColor}`,
                  color: accentColor
                }}
              >
                <PlusIcon />
                ADD SYMBOL
              </button>
            </div>
          </div>
        ) : currentSymbolData ? (
          // Trading Dashboard with Dockable Workspace
          <TapeFlowWorkspace 
            symbolData={currentSymbolData} 
            pauseScroll={settings.pauseScroll} 
          />
        ) : tabs.length > 0 ? (
          // Loading state - symbol added but data not yet received
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
            <div className="text-center font-mono">
              <p className="text-sm" style={{ color: accentColor }}>CONNECTING TO {selectedSymbol}</p>
              <p className="text-xs text-gray-600 mt-1">Waiting for market data...</p>
            </div>
          </div>
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

      {/* Hotkeys Panel */}
      <HotkeysPanel isOpen={showHotkeys} onClose={() => setShowHotkeys(false)} />

      {/* Alerts Panel */}
      <AlertsPanel 
        isOpen={showAlerts} 
        onClose={() => setShowAlerts(false)}
        currentPrice={currentSymbolData?.lastPrice}
        symbol={selectedSymbol || undefined}
      />

      {/* Alert Toast Notifications */}
      <AlertToastContainer />
    </div>
  );
}
