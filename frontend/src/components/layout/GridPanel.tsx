// GridPanel - Wrapper component for panels in the grid layout
// Provides dimensions to children via render prop pattern

import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { usePanelDimensions } from '../../hooks/usePanelDimensions';
import type { PanelId, PanelDimensions } from '../../types/layout';

export interface GridPanelProps {
  /** Panel identifier for layout tracking */
  panelId: PanelId;
  /** Additional CSS classes */
  className?: string;
  /**
   * Children can be ReactNode or a render prop function that receives dimensions.
   * Use render prop pattern when children need to know their container size.
   */
  children: ReactNode | ((dimensions: PanelDimensions) => ReactNode);
}

/**
 * Panel wrapper that provides dimensions to children via render prop.
 * Used inside DashboardGrid to wrap each panel component.
 *
 * @example
 * // Static children (no dimension awareness needed)
 * <GridPanel panelId="tape-table">
 *   <TapeTable />
 * </GridPanel>
 *
 * @example
 * // Render prop for dimension-aware children
 * <GridPanel panelId="tabbed-chart">
 *   {({ width, height }) => (
 *     <TabbedChartPanel width={width} height={height} />
 *   )}
 * </GridPanel>
 */
export function GridPanel({ panelId, className, children }: GridPanelProps) {
  const { ref, dimensions } = usePanelDimensions();

  // Determine if children is a render prop function
  const content =
    typeof children === 'function' ? children(dimensions) : children;

  return (
    <div
      ref={ref}
      data-testid={`grid-panel-${panelId}`}
      data-panel={panelId}
      className={cn(
        'w-full h-full overflow-hidden',
        'bg-black rounded border border-gray-800',
        className
      )}
    >
      {content}
    </div>
  );
}
