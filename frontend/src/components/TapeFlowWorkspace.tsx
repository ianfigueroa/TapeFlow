/**
 * TapeFlowWorkspace - Professional dockable workspace using flexlayout-react
 * 
 * Tradovate-style drag-and-drop panel system where users can:
 * - Drag tabs to any edge or center to dock
 * - Resize panels by dragging borders
 * - Float panels into separate windows (popout)
 * - Save/load custom layouts
 * 
 * This replaces the static CSS grid TradingDashboard with a fully customizable workspace.
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import {
  Layout,
  Model,
  TabNode,
  IJsonModel,
  Actions,
  DockLocation,
  ITabSetRenderValues,
  TabSetNode,
  BorderNode,
} from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
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
import { DOMLadder } from './DOMLadder';
import { ExecutionPanel } from './ExecutionPanel';
import type { SymbolState } from '../types';

// Layout storage keys
const LAYOUT_STORAGE_KEY = 'tapeflow-workspace-layout';
const LAYOUT_VERSION_KEY = 'tapeflow-layout-version';
const SAVED_LAYOUTS_KEY = 'tapeflow-saved-layouts';
const DEFAULT_LAYOUT_KEY = 'tapeflow-default-layout';
const CURRENT_LAYOUT_VERSION = 11; // Bump to force layout reset - Added Trading panel

// Named layout type
interface SavedLayout {
  name: string;
  layout: IJsonModel;
  createdAt: number;
}

// Default layout JSON model for flexlayout-react
const defaultLayoutJson: IJsonModel = {
  global: {
    tabEnableClose: true,
    tabEnableDrag: true,
    tabEnableRename: false,
    tabSetMinWidth: 150,
    tabSetMinHeight: 150,
    splitterSize: 4,
    splitterExtra: 4,
    enableEdgeDock: true,
    rootOrientationVertical: false,
  },
  borders: [
    {
      type: 'border',
      location: 'bottom',
      size: 200,
      children: [
        {
          type: 'tab',
          name: 'Analytics',
          component: 'analytics',
          enableClose: false,
        },
      ],
    },
  ],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      // Left column - Time & Sales
      {
        type: 'tabset',
        weight: 18,
        children: [
          {
            type: 'tab',
            name: 'Time & Sales',
            component: 'tape',
            enableClose: false,
          },
        ],
      },
      // Center column - Charts
      {
        type: 'row',
        weight: 45,
        children: [
          {
            type: 'tabset',
            weight: 60,
            children: [
              {
                type: 'tab',
                name: 'Price Chart',
                component: 'chart',
              },
              {
                type: 'tab',
                name: 'Footprint',
                component: 'footprint',
              },
            ],
          },
          {
            type: 'tabset',
            weight: 40,
            children: [
              {
                type: 'tab',
                name: 'CVD',
                component: 'cvd',
              },
              {
                type: 'tab',
                name: 'Volume Profile',
                component: 'profile',
              },
            ],
          },
        ],
      },
      // Right column - Order Book & Tools
      {
        type: 'row',
        weight: 37,
        children: [
          {
            type: 'tabset',
            weight: 55,
            children: [
              {
                type: 'tab',
                name: 'Order Book',
                component: 'orderbook',
                enableClose: false,
              },
              {
                type: 'tab',
                name: 'DOM Ladder',
                component: 'dom',
              },
              {
                type: 'tab',
                name: 'Trading',
                component: 'trading',
              },
            ],
          },
          {
            type: 'tabset',
            weight: 45,
            children: [
              {
                type: 'tab',
                name: 'Imbalance',
                component: 'imbalance',
              },
              {
                type: 'tab',
                name: 'Open Interest',
                component: 'oi',
              },
              {
                type: 'tab',
                name: 'Liquidations',
                component: 'liquidations',
              },
            ],
          },
        ],
      },
    ],
  },
};

// Layout presets
const LAYOUT_PRESETS: { [key: string]: IJsonModel } = {
  default: defaultLayoutJson,
  trading: {
    ...defaultLayoutJson,
    layout: {
      type: 'row',
      weight: 100,
      children: [
        { type: 'tabset', weight: 20, children: [{ type: 'tab', name: 'Time & Sales', component: 'tape', enableClose: false }] },
        { type: 'tabset', weight: 40, children: [{ type: 'tab', name: 'Price Chart', component: 'chart' }, { type: 'tab', name: 'Footprint', component: 'footprint' }] },
        { type: 'tabset', weight: 25, children: [{ type: 'tab', name: 'Order Book', component: 'orderbook', enableClose: false }, { type: 'tab', name: 'DOM Ladder', component: 'dom' }] },
        { type: 'tabset', weight: 15, children: [{ type: 'tab', name: 'Trading', component: 'trading' }] },
      ],
    },
    borders: [],
  },
  analysis: {
    ...defaultLayoutJson,
    layout: {
      type: 'row',
      weight: 100,
      children: [
        {
          type: 'row',
          weight: 70,
          children: [
            { type: 'tabset', weight: 60, children: [{ type: 'tab', name: 'Price Chart', component: 'chart' }, { type: 'tab', name: 'Footprint', component: 'footprint' }] },
            { type: 'tabset', weight: 40, children: [{ type: 'tab', name: 'CVD', component: 'cvd' }, { type: 'tab', name: 'Volume Profile', component: 'profile' }] },
          ],
        },
        {
          type: 'tabset',
          weight: 30,
          children: [
            { type: 'tab', name: 'Open Interest', component: 'oi' },
            { type: 'tab', name: 'Liquidations', component: 'liquidations' },
          ],
        },
      ],
    },
    borders: [
      { type: 'border', location: 'left', size: 250, children: [{ type: 'tab', name: 'Time & Sales', component: 'tape', enableClose: false }] },
      { type: 'border', location: 'right', size: 300, children: [{ type: 'tab', name: 'Order Book', component: 'orderbook', enableClose: false }] },
    ],
  },
  compact: {
    ...defaultLayoutJson,
    layout: {
      type: 'row',
      weight: 100,
      children: [
        { type: 'tabset', weight: 25, children: [{ type: 'tab', name: 'Time & Sales', component: 'tape', enableClose: false }] },
        { type: 'tabset', weight: 50, children: [{ type: 'tab', name: 'Price Chart', component: 'chart' }] },
        { type: 'tabset', weight: 25, children: [{ type: 'tab', name: 'Order Book', component: 'orderbook', enableClose: false }] },
      ],
    },
    borders: [],
  },
};

interface TapeFlowWorkspaceProps {
  symbolData: SymbolState;
  pauseScroll: boolean;
}

export function TapeFlowWorkspace({ symbolData, pauseScroll }: TapeFlowWorkspaceProps) {
  const [model, setModel] = useState<Model | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const layoutRef = useRef<Layout>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modelRef = useRef<Model | null>(null); // Track model for cleanup save
  
  // Calculate current price for liquidation heatmap
  const currentPrice = symbolData.trades?.[0]?.price || 
    (symbolData.orderBook?.bids?.[0] && symbolData.orderBook?.asks?.[0] 
      ? (symbolData.orderBook.bids[0].price + symbolData.orderBook.asks[0].price) / 2 
      : 0);

  // Load saved layouts list on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_LAYOUTS_KEY);
      if (saved) {
        setSavedLayouts(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('[TapeFlowWorkspace] Failed to load saved layouts list', e);
    }
  }, []);

  // Load saved layout or use default
  useEffect(() => {
    try {
      const savedVersion = localStorage.getItem(LAYOUT_VERSION_KEY);
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      
      console.log('[TapeFlowWorkspace] Loading layout - version:', savedVersion, 'expected:', CURRENT_LAYOUT_VERSION);
      
      // Force reset if layout version changed or no saved layout
      if (savedLayout && savedVersion === String(CURRENT_LAYOUT_VERSION)) {
        const parsedLayout = JSON.parse(savedLayout);
        const loadedModel = Model.fromJson(parsedLayout);
        setModel(loadedModel);
        modelRef.current = loadedModel;
        console.log('[TapeFlowWorkspace] Loaded saved layout successfully');
      } else {
        // Reset to default and save new version
        console.log('[TapeFlowWorkspace] Layout version changed or no saved layout, resetting to default');
        localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
        const defaultModel = Model.fromJson(defaultLayoutJson);
        setModel(defaultModel);
        modelRef.current = defaultModel;
      }
    } catch (e) {
      console.warn('[TapeFlowWorkspace] Failed to load saved layout, using default', e);
      const defaultModel = Model.fromJson(defaultLayoutJson);
      setModel(defaultModel);
      modelRef.current = defaultModel;
    }
    
    // Cleanup: save layout when component unmounts (e.g., symbol switch)
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Force save on unmount to prevent layout loss during symbol switches
      if (modelRef.current) {
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(modelRef.current.toJson()));
          localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
          console.log('[TapeFlowWorkspace] Saved layout on unmount');
        } catch (e) {
          console.warn('[TapeFlowWorkspace] Failed to save layout on unmount', e);
        }
      }
    };
  }, []);

  // Save layout on change with debounce to prevent excessive writes during drag
  const handleModelChange = useCallback((newModel: Model) => {
    // Update ref immediately for cleanup save
    modelRef.current = newModel;
    
    // Debounce localStorage writes (500ms) to avoid partial saves during drag
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newModel.toJson()));
        // Also save version to ensure they stay in sync
        localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
        console.log('[TapeFlowWorkspace] Layout saved');
      } catch (e) {
        console.warn('[TapeFlowWorkspace] Failed to save layout', e);
      }
    }, 500);
  }, []);

  // Factory function to render panel components
  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent();
    
    switch (component) {
      case 'tape':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <TapeTable
              trades={symbolData.trades}
              assetType={symbolData.assetType}
              symbol={symbolData.symbol}
              pauseScroll={pauseScroll}
              showAnalytics={false}
              compact={true}
            />
          </div>
        );
        
      case 'chart':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <ChartPanel
              trades={symbolData.trades}
              symbol={symbolData.symbol}
              compact={false}
            />
          </div>
        );
        
      case 'footprint':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <FootprintChart
              symbol={symbolData.symbol}
              trades={symbolData.trades}
            />
          </div>
        );
        
      case 'orderbook':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <OrderBook
              orderBook={symbolData.orderBook}
              assetType={symbolData.assetType}
              symbol={symbolData.symbol}
              showHeatmap={true}
              maxLevels={15}
            />
          </div>
        );
        
      case 'dom':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <DOMLadder
              symbol={symbolData.symbol}
              levels={20}
            />
          </div>
        );
        
      case 'imbalance':
        return (
          <div className="h-full w-full overflow-hidden bg-black p-2">
            <ImbalanceMeter
              symbol={symbolData.symbol}
              levels={10}
              orientation="horizontal"
              showLabels={true}
            />
          </div>
        );
        
      case 'cvd':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <CVDOverlay
              symbol={symbolData.symbol}
              height={150}
            />
          </div>
        );
        
      case 'profile':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <VolumeProfile
              symbol={symbolData.symbol}
              compact={false}
            />
          </div>
        );
        
      case 'oi':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <OIMonitor
              symbol={symbolData.symbol}
              className="h-full"
            />
          </div>
        );
        
      case 'liquidations':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <LiquidationHeatmap
              symbol={symbolData.symbol}
              currentPrice={currentPrice}
              className="h-full"
            />
          </div>
        );
        
      case 'analytics':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <TabbedToolsPanel symbol={symbolData.symbol} />
          </div>
        );
        
      case 'trading':
        return (
          <div className="h-full w-full overflow-hidden bg-black">
            <ExecutionPanel 
              symbol={symbolData.symbol} 
              currentPrice={currentPrice} 
            />
          </div>
        );
        
      default:
        return (
          <div className="h-full w-full flex items-center justify-center bg-black text-gray-500 font-mono text-sm">
            Unknown component: {component}
          </div>
        );
    }
  }, [symbolData, pauseScroll, currentPrice]);

  // Custom tab set header with add button
  const onRenderTabSet = useCallback((
    _node: TabSetNode | BorderNode,
    _renderValues: ITabSetRenderValues
  ) => {
    // Add subtle styling
  }, []);

  // Reset to preset layout
  const resetToPreset = useCallback((presetName: string) => {
    const preset = LAYOUT_PRESETS[presetName];
    if (preset) {
      const newModel = Model.fromJson(preset);
      setModel(newModel);
      modelRef.current = newModel;
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(preset));
      localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
    }
  }, []);

  // Add a new panel
  const addPanel = useCallback((component: string, name: string) => {
    if (!model) return;
    
    // Find a tabset to add to
    const activeTabset = model.getActiveTabset();
    if (activeTabset) {
      model.doAction(
        Actions.addNode(
          { type: 'tab', component, name },
          activeTabset.getId(),
          DockLocation.CENTER,
          -1
        )
      );
    }
  }, [model]);

  // Save current layout with a name
  const saveNamedLayout = useCallback((name: string) => {
    if (!model || !name.trim()) return;
    
    const newLayout: SavedLayout = {
      name: name.trim(),
      layout: model.toJson() as IJsonModel,
      createdAt: Date.now(),
    };
    
    // Replace if exists, otherwise add
    const updated = savedLayouts.filter(l => l.name !== name.trim());
    updated.push(newLayout);
    
    setSavedLayouts(updated);
    localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(updated));
    setShowSaveDialog(false);
    setNewLayoutName('');
    console.log('[TapeFlowWorkspace] Saved named layout:', name);
  }, [model, savedLayouts]);

  // Load a named layout
  const loadNamedLayout = useCallback((layout: SavedLayout) => {
    try {
      const newModel = Model.fromJson(layout.layout);
      setModel(newModel);
      modelRef.current = newModel;
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout.layout));
      localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
      setShowLoadDialog(false);
      console.log('[TapeFlowWorkspace] Loaded named layout:', layout.name);
    } catch (e) {
      console.warn('[TapeFlowWorkspace] Failed to load named layout', e);
    }
  }, []);

  // Delete a named layout
  const deleteNamedLayout = useCallback((name: string) => {
    const updated = savedLayouts.filter(l => l.name !== name);
    setSavedLayouts(updated);
    localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(updated));
    console.log('[TapeFlowWorkspace] Deleted named layout:', name);
  }, [savedLayouts]);

  // Set a layout as the default (loads on app start)
  const setAsDefault = useCallback((layout: SavedLayout) => {
    localStorage.setItem(DEFAULT_LAYOUT_KEY, layout.name);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout.layout));
    localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
    console.log('[TapeFlowWorkspace] Set default layout:', layout.name);
  }, []);

  // Reset layout to factory defaults
  const resetToFactory = useCallback(() => {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    const newModel = Model.fromJson(defaultLayoutJson);
    setModel(newModel);
    modelRef.current = newModel;
    localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
    console.log('[TapeFlowWorkspace] Reset to factory defaults');
  }, []);

  if (!model) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ backgroundColor: 'var(--tf-bg-primary)' }}>
        <div className="font-mono animate-pulse" style={{ color: 'var(--tf-accent-primary)' }}>
          Loading workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--tf-bg-primary)' }}>
      {/* Workspace toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 py-1" style={{ backgroundColor: 'var(--tf-bg-secondary)', borderBottom: '1px solid var(--tf-border-primary)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase" style={{ color: 'var(--tf-text-muted)' }}>Layout:</span>
          <button
            onClick={() => resetToPreset('default')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Default
          </button>
          <button
            onClick={() => resetToPreset('trading')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Trading
          </button>
          <button
            onClick={() => resetToPreset('analysis')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Analysis
          </button>
          <button
            onClick={() => resetToPreset('compact')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Compact
          </button>
          
          {/* Divider */}
          <div className="w-px h-4 bg-gray-700 mx-1" />
          
          {/* Save/Load/Reset buttons */}
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button text-green-400 hover:bg-green-900/30"
          >
            💾 Save
          </button>
          <button
            onClick={() => setShowLoadDialog(true)}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button text-blue-400 hover:bg-blue-900/30"
            disabled={savedLayouts.length === 0}
          >
            📂 Load ({savedLayouts.length})
          </button>
          <button
            onClick={resetToFactory}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button text-orange-400 hover:bg-orange-900/30"
          >
            ↺ Reset
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: 'var(--tf-text-muted)' }}>+ Add Panel:</span>
          <button
            onClick={() => addPanel('footprint', 'Footprint')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Footprint
          </button>
          <button
            onClick={() => addPanel('cvd', 'CVD')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            CVD
          </button>
          <button
            onClick={() => addPanel('profile', 'Volume Profile')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Profile
          </button>
          <button
            onClick={() => addPanel('dom', 'DOM')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            DOM
          </button>
          <button
            onClick={() => addPanel('trading', 'Trading')}
            className="px-2 py-0.5 text-xs font-mono rounded transition-colors tf-button"
          >
            Trading
          </button>
        </div>
      </div>
      
      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-80">
            <h3 className="text-sm font-mono text-green-400 mb-3">💾 Save Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              placeholder="Enter layout name..."
              className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white mb-3 focus:border-green-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && saveNamedLayout(newLayoutName)}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowSaveDialog(false); setNewLayoutName(''); }}
                className="px-3 py-1.5 text-xs font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={() => saveNamedLayout(newLayoutName)}
                disabled={!newLayoutName.trim()}
                className="px-3 py-1.5 text-xs font-mono rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Load Layout Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-96 max-h-[400px] overflow-hidden flex flex-col">
            <h3 className="text-sm font-mono text-blue-400 mb-3">📂 Load Layout</h3>
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {savedLayouts.length === 0 ? (
                <p className="text-gray-500 text-sm font-mono text-center py-4">No saved layouts</p>
              ) : (
                savedLayouts.map((layout) => (
                  <div key={layout.name} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2 group hover:bg-gray-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-white truncate">{layout.name}</p>
                      <p className="text-[10px] font-mono text-gray-500">
                        {new Date(layout.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => loadNamedLayout(layout)}
                        className="px-2 py-1 text-xs font-mono rounded bg-blue-600 hover:bg-blue-500 text-white"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => setAsDefault(layout)}
                        className="px-2 py-1 text-xs font-mono rounded bg-yellow-600 hover:bg-yellow-500 text-black"
                        title="Set as default"
                      >
                        ⭐
                      </button>
                      <button
                        onClick={() => deleteNamedLayout(layout.name)}
                        className="px-2 py-1 text-xs font-mono rounded bg-red-600 hover:bg-red-500 text-white"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end mt-3 pt-3 border-t border-gray-700">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="px-3 py-1.5 text-xs font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* FlexLayout workspace */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{ height: '100%' }}>
        <Layout
          ref={layoutRef}
          model={model}
          factory={factory}
          onModelChange={handleModelChange} 
          onRenderTabSet={onRenderTabSet}
          classNameMapper={(className) => {
            // Map flexlayout classes to our theme
            return className;
          }}
        />
      </div>
    </div>
  );
}

export default TapeFlowWorkspace;
