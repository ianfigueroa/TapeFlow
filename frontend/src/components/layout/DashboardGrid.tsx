// DashboardGrid - ResponsiveGridLayout wrapper for panel arrangement
// Note: This component is deprecated in favor of the CSS Grid Bento-box layout in TradingDashboard.tsx
// Keeping for backwards compatibility but stubbing out react-grid-layout dependency

import { type ReactElement, Children, cloneElement, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { LayoutItem, Layout, ResponsiveLayouts } from '../../types/layout';
import { useLayoutStore } from '../../stores/useLayoutStore';
import type { GridConfig, PanelId, Layouts } from '../../types/layout';

// Stub for react-grid-layout (not installed)
const ResponsiveGridLayout = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
  <div className="react-grid-layout-stub" data-props={JSON.stringify(Object.keys(props))}>{children}</div>
);
const verticalCompactor = () => {};

// Grid configuration
export const GRID_CONFIG: GridConfig = {
  breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480 },
  cols: { lg: 24, md: 18, sm: 12, xs: 6 },
  rowHeight: 30,
  margin: [4, 4],
  containerPadding: [4, 4],
};

export interface DashboardGridProps {
  /** Panel elements - must have key matching PanelId */
  children: ReactElement | ReactElement[];
  /** Optional callback when dragging starts */
  onDragStart?: () => void;
  /** Optional callback when dragging ends */
  onDragStop?: () => void;
}

/**
 * Hook to track container width using ResizeObserver
 */
function useContainerWidth(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);

    // Initial measurement
    setWidth(container.offsetWidth);

    return () => observer.disconnect();
  }, [containerRef]);

  return width;
}

/**
 * Responsive grid layout wrapper that manages panel positions.
 * Reads from and writes to useLayoutStore for persistence.
 *
 * Children must have a `key` prop matching their PanelId.
 *
 * @example
 * <DashboardGrid>
 *   <GridPanel key="tape-table" panelId="tape-table">
 *     <TapeTable />
 *   </GridPanel>
 *   <GridPanel key="tabbed-chart" panelId="tabbed-chart">
 *     {({ width, height }) => <TabbedChartPanel width={width} height={height} />}
 *   </GridPanel>
 * </DashboardGrid>
 */
export function DashboardGrid({
  children,
  onDragStart,
  onDragStop,
}: DashboardGridProps) {
  // Get layout state from store
  const currentLayouts = useLayoutStore((state) => state.currentLayouts);
  const isLocked = useLayoutStore((state) => state.isLocked);
  const hiddenPanels = useLayoutStore((state) => state.hiddenPanels);
  const updateLayouts = useLayoutStore((state) => state.updateLayouts);

  // Container ref for width measurement
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);

  // Filter out hidden panels from children
  const visibleChildren = useMemo(() => {
    const childArray = Children.toArray(children) as ReactElement[];
    return childArray.filter((child) => {
      // Children.toArray adds ".$" prefix to keys, extract the original key
      const rawKey = child.key as string;
      const key = rawKey?.startsWith('.$') ? rawKey.slice(2) : rawKey;
      return !hiddenPanels.includes(key as PanelId);
    });
  }, [children, hiddenPanels]);

  // Filter layouts to only include visible panels
  const filteredLayouts = useMemo((): ResponsiveLayouts => {
    const result: ResponsiveLayouts = {};
    for (const [breakpoint, layout] of Object.entries(currentLayouts)) {
      if (Array.isArray(layout)) {
        result[breakpoint] = layout.filter(
          (item: LayoutItem) => !hiddenPanels.includes(item.i as PanelId)
        );
      }
    }
    return result;
  }, [currentLayouts, hiddenPanels]);

  // Handle layout changes - v2 API
  const handleLayoutChange = useCallback(
    (_layout: Layout, allLayouts: ResponsiveLayouts) => {
      // Only update if not locked
      if (!isLocked) {
        // Convert to our mutable Layouts type
        const newLayouts: Layouts = {};
        for (const [key, value] of Object.entries(allLayouts)) {
          if (value) {
            // Create mutable copy of the readonly array
            newLayouts[key] = [...value];
          }
        }
        updateLayouts(newLayouts);
      }
    },
    [isLocked, updateLayouts]
  );

  // Handle drag start - pause data updates
  const handleDragStart = useCallback(() => {
    onDragStart?.();
  }, [onDragStart]);

  // Handle drag stop - resume data updates
  const handleDragStop = useCallback(() => {
    onDragStop?.();
  }, [onDragStop]);

  // Drag config - disabled when locked
  const dragConfig = useMemo(
    () =>
      isLocked
        ? { enabled: false }
        : { enabled: true, handle: '.drag-handle' },
    [isLocked]
  );

  // Resize config - disabled when locked
  const resizeConfig = useMemo(
    () =>
      isLocked
        ? { enabled: false }
        : { enabled: true },
    [isLocked]
  );

  return (
    <div
      ref={containerRef}
      data-testid="dashboard-grid"
      data-locked={isLocked}
      className="w-full h-full"
    >
      {width > 0 && (
        <ResponsiveGridLayout
          className="react-grid-layout"
          width={width}
          layouts={filteredLayouts}
          breakpoints={GRID_CONFIG.breakpoints}
          cols={GRID_CONFIG.cols}
          rowHeight={GRID_CONFIG.rowHeight}
          margin={GRID_CONFIG.margin}
          containerPadding={GRID_CONFIG.containerPadding}
          dragConfig={dragConfig}
          resizeConfig={resizeConfig}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
          onDragStart={handleDragStart}
          onDragStop={handleDragStop}
        >
          {visibleChildren.map((child) =>
            cloneElement(child, {
              key: child.key,
            })
          )}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
