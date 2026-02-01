/**
 * useHotkeys - Keyboard shortcut management hook
 * 
 * Professional-grade keyboard shortcuts for trading terminal:
 * - Symbol switching (1-9 for watchlist)
 * - Panel focus (Ctrl+1-9)
 * - Quick actions (Buy/Sell with Shift+B/S)
 * - Mode toggles (Escape to cancel)
 * - Global and scoped shortcuts
 */

import { useEffect, useRef } from 'react';

export interface HotkeyConfig {
  key: string;          // e.g., 'b', 'Enter', 'Escape', 'ArrowUp'
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;       // Cmd on Mac
  action: () => void;
  description: string;
  scope?: string;       // e.g., 'global', 'orderEntry', 'chart'
  enabled?: boolean;
}

interface HotkeyMap {
  [key: string]: HotkeyConfig;
}

// Generate a unique key for the hotkey
function getHotkeyId(config: HotkeyConfig): string {
  const parts: string[] = [];
  if (config.meta) parts.push('meta');
  if (config.ctrl) parts.push('ctrl');
  if (config.alt) parts.push('alt');
  if (config.shift) parts.push('shift');
  parts.push(config.key.toLowerCase());
  return parts.join('+');
}

// Check if the event matches the hotkey config
function matchesHotkey(event: KeyboardEvent, config: HotkeyConfig): boolean {
  const keyMatch = event.key.toLowerCase() === config.key.toLowerCase() ||
                   event.code.toLowerCase() === config.key.toLowerCase();
  
  if (!keyMatch) return false;
  if (!!config.ctrl !== event.ctrlKey) return false;
  if (!!config.shift !== event.shiftKey) return false;
  if (!!config.alt !== event.altKey) return false;
  if (!!config.meta !== event.metaKey) return false;
  
  return true;
}

// Check if we're in an input element
function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

// Global hotkey registry for showing help
const globalHotkeyRegistry: HotkeyConfig[] = [];

export function getRegisteredHotkeys(): HotkeyConfig[] {
  return [...globalHotkeyRegistry];
}

/**
 * Main useHotkeys hook
 * 
 * @param hotkeys Array of hotkey configurations
 * @param deps Dependency array for re-registering hotkeys
 * @param options Additional options
 */
export function useHotkeys(
  hotkeys: HotkeyConfig[],
  deps: React.DependencyList = [],
  options: {
    enabled?: boolean;
    ignoreInputs?: boolean;
    scope?: string;
  } = {}
): void {
  const {
    enabled = true,
    ignoreInputs = true,
    scope = 'global',
  } = options;
  
  const hotkeysRef = useRef<HotkeyMap>({});
  
  // Build hotkey map
  useEffect(() => {
    hotkeysRef.current = {};
    
    for (const config of hotkeys) {
      if (config.enabled === false) continue;
      
      const id = getHotkeyId(config);
      hotkeysRef.current[id] = {
        ...config,
        scope: config.scope || scope,
      };
    }
    
    // Register globally for help display
    hotkeys.forEach(h => {
      const existing = globalHotkeyRegistry.findIndex(
        r => getHotkeyId(r) === getHotkeyId(h)
      );
      if (existing >= 0) {
        globalHotkeyRegistry[existing] = h;
      } else {
        globalHotkeyRegistry.push(h);
      }
    });
    
    // Cleanup on unmount
    return () => {
      hotkeys.forEach(h => {
        const idx = globalHotkeyRegistry.findIndex(
          r => getHotkeyId(r) === getHotkeyId(h)
        );
        if (idx >= 0) {
          globalHotkeyRegistry.splice(idx, 1);
        }
      });
    };
  }, [hotkeys, scope, ...deps]);
  
  // Event handler
  useEffect(() => {
    if (!enabled) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if in input and ignoreInputs is true
      if (ignoreInputs && isInputElement(event.target as Element)) {
        return;
      }
      
      // Find matching hotkey
      for (const config of Object.values(hotkeysRef.current)) {
        if (matchesHotkey(event, config)) {
          event.preventDefault();
          event.stopPropagation();
          config.action();
          return;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, ignoreInputs]);
}

/**
 * Preset hotkey configurations for common trading actions
 */
export interface TradingHotkeyActions {
  onSymbolSelect?: (index: number) => void;
  onFocusPanel?: (panelId: string) => void;
  onQuickBuy?: () => void;
  onQuickSell?: () => void;
  onCancel?: () => void;
  onToggleHelp?: () => void;
  onToggleSettings?: () => void;
  onToggleFullscreen?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetLayout?: () => void;
  onNextSymbol?: () => void;
  onPrevSymbol?: () => void;
}

export function createTradingHotkeys(actions: TradingHotkeyActions): HotkeyConfig[] {
  const hotkeys: HotkeyConfig[] = [];
  
  // Symbol quick select (1-9)
  if (actions.onSymbolSelect) {
    for (let i = 1; i <= 9; i++) {
      hotkeys.push({
        key: String(i),
        action: () => actions.onSymbolSelect!(i - 1),
        description: `Select symbol ${i} from watchlist`,
        scope: 'global',
      });
    }
  }
  
  // Panel focus (Ctrl+1-9)
  if (actions.onFocusPanel) {
    const panels = ['tape', 'orderbook', 'chart', 'sentiment', 'news', 'volume', 'dom', 'signals', 'analytics'];
    for (let i = 0; i < Math.min(9, panels.length); i++) {
      hotkeys.push({
        key: String(i + 1),
        ctrl: true,
        action: () => actions.onFocusPanel!(panels[i]),
        description: `Focus ${panels[i]} panel`,
        scope: 'global',
      });
    }
  }
  
  // Quick trading
  if (actions.onQuickBuy) {
    hotkeys.push({
      key: 'b',
      shift: true,
      action: actions.onQuickBuy,
      description: 'Quick buy (paper trading)',
      scope: 'trading',
    });
  }
  
  if (actions.onQuickSell) {
    hotkeys.push({
      key: 's',
      shift: true,
      action: actions.onQuickSell,
      description: 'Quick sell (paper trading)',
      scope: 'trading',
    });
  }
  
  // Cancel/Escape
  if (actions.onCancel) {
    hotkeys.push({
      key: 'Escape',
      action: actions.onCancel,
      description: 'Cancel/Close dialog',
      scope: 'global',
    });
  }
  
  // Help
  if (actions.onToggleHelp) {
    hotkeys.push({
      key: '?',
      shift: true,
      action: actions.onToggleHelp,
      description: 'Show keyboard shortcuts',
      scope: 'global',
    });
    
    hotkeys.push({
      key: 'F1',
      action: actions.onToggleHelp,
      description: 'Show help',
      scope: 'global',
    });
  }
  
  // Settings
  if (actions.onToggleSettings) {
    hotkeys.push({
      key: ',',
      ctrl: true,
      action: actions.onToggleSettings,
      description: 'Open settings',
      scope: 'global',
    });
  }
  
  // Fullscreen
  if (actions.onToggleFullscreen) {
    hotkeys.push({
      key: 'f',
      ctrl: true,
      shift: true,
      action: actions.onToggleFullscreen,
      description: 'Toggle fullscreen',
      scope: 'global',
    });
  }
  
  // Zoom
  if (actions.onZoomIn) {
    hotkeys.push({
      key: '=',
      ctrl: true,
      action: actions.onZoomIn,
      description: 'Zoom in',
      scope: 'chart',
    });
  }
  
  if (actions.onZoomOut) {
    hotkeys.push({
      key: '-',
      ctrl: true,
      action: actions.onZoomOut,
      description: 'Zoom out',
      scope: 'chart',
    });
  }
  
  // Reset layout
  if (actions.onResetLayout) {
    hotkeys.push({
      key: 'r',
      ctrl: true,
      shift: true,
      action: actions.onResetLayout,
      description: 'Reset layout to default',
      scope: 'global',
    });
  }
  
  // Symbol navigation
  if (actions.onNextSymbol) {
    hotkeys.push({
      key: 'ArrowRight',
      alt: true,
      action: actions.onNextSymbol,
      description: 'Next symbol',
      scope: 'global',
    });
  }
  
  if (actions.onPrevSymbol) {
    hotkeys.push({
      key: 'ArrowLeft',
      alt: true,
      action: actions.onPrevSymbol,
      description: 'Previous symbol',
      scope: 'global',
    });
  }
  
  return hotkeys;
}

/**
 * Format hotkey for display
 */
export function formatHotkey(config: HotkeyConfig): string {
  const parts: string[] = [];
  
  // Use platform-appropriate modifier names
  const isMac = typeof navigator !== 'undefined' && 
                navigator.platform.toLowerCase().includes('mac');
  
  if (config.meta) parts.push(isMac ? '⌘' : 'Win');
  if (config.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
  if (config.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (config.shift) parts.push(isMac ? '⇧' : 'Shift');
  
  // Format key name
  let keyName = config.key;
  if (keyName === 'ArrowUp') keyName = '↑';
  else if (keyName === 'ArrowDown') keyName = '↓';
  else if (keyName === 'ArrowLeft') keyName = '←';
  else if (keyName === 'ArrowRight') keyName = '→';
  else if (keyName === 'Escape') keyName = 'Esc';
  else if (keyName === ' ') keyName = 'Space';
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  
  parts.push(keyName);
  
  return parts.join(isMac ? '' : '+');
}

/**
 * Get hotkeys grouped by scope
 */
export function getHotkeysByScope(): Map<string, HotkeyConfig[]> {
  const grouped = new Map<string, HotkeyConfig[]>();
  
  for (const config of globalHotkeyRegistry) {
    const scope = config.scope || 'global';
    if (!grouped.has(scope)) {
      grouped.set(scope, []);
    }
    grouped.get(scope)!.push(config);
  }
  
  return grouped;
}

export default useHotkeys;
