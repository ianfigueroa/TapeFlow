// Layout types for react-grid-layout integration
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout';

// Re-export for convenience
// Note: v2 uses ResponsiveLayouts instead of Layouts
export type { Layout, LayoutItem };
export type Layouts = ResponsiveLayouts;

/**
 * Panel identifiers matching dashboard components
 */
export type PanelId =
  | 'tape-table'
  | 'algo-signals'
  | 'tabbed-chart'
  | 'order-book'
  | 'analysis-dashboard'
  | 'sentiment-panel'
  | 'news-feed'
  | 'volume-profile'
  | 'dom-ladder';

/**
 * Saved layout preset configuration
 */
export interface LayoutPreset {
  id: string;
  name: string;
  layouts: Layouts;
  isBuiltIn: boolean;
}

/**
 * Complete layout state persisted to localStorage
 */
export interface LayoutState {
  layoutVersion: number;
  currentLayouts: Layouts;
  activePresetId: string;
  presets: LayoutPreset[];
  isLocked: boolean;
  hiddenPanels: PanelId[];
}

/**
 * Responsive breakpoint names
 */
export type Breakpoint = 'lg' | 'md' | 'sm' | 'xs';

/**
 * Grid configuration for ResponsiveGridLayout
 */
export interface GridConfig {
  breakpoints: Record<Breakpoint, number>;
  cols: Record<Breakpoint, number>;
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
}

/**
 * Panel dimension information from ResizeObserver
 */
export interface PanelDimensions {
  width: number;
  height: number;
}

/**
 * Actions for layout store
 */
export interface LayoutActions {
  updateLayouts: (layouts: Layouts) => void;
  loadPreset: (presetId: string) => void;
  savePreset: (name: string) => void;
  deletePreset: (presetId: string) => void;
  setLocked: (locked: boolean) => void;
  resetToDefault: () => void;
  hidePanel: (panelId: PanelId) => void;
  showPanel: (panelId: PanelId) => void;
  togglePanel: (panelId: PanelId) => void;
}
