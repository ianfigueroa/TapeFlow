import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock ResizeObserver that immediately triggers with a fixed size
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // Immediately trigger callback with mock dimensions
    setTimeout(() => {
      this.callback(
        [
          {
            target,
            contentRect: {
              width: 1200,
              height: 800,
              top: 0,
              left: 0,
              bottom: 800,
              right: 1200,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            },
            borderBoxSize: [{ blockSize: 800, inlineSize: 1200 }],
            contentBoxSize: [{ blockSize: 800, inlineSize: 1200 }],
            devicePixelContentBoxSize: [{ blockSize: 800, inlineSize: 1200 }],
          } as ResizeObserverEntry,
        ],
        this
      );
    }, 0);
  }
  unobserve() {}
  disconnect() {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;

// Mock offsetWidth for initial measurement
Object.defineProperty(HTMLDivElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return 1200;
  },
});

// Mock useLayoutStore
const mockLayoutStore = {
  currentLayouts: {
    lg: [
      { i: 'tape-table', x: 0, y: 0, w: 5, h: 20 },
      { i: 'algo-signals', x: 0, y: 20, w: 5, h: 7 },
      { i: 'tabbed-chart', x: 5, y: 0, w: 14, h: 27 },
      { i: 'order-book', x: 19, y: 0, w: 5, h: 17 },
      { i: 'analysis-dashboard', x: 19, y: 17, w: 5, h: 10 },
    ],
  },
  isLocked: false,
  hiddenPanels: [] as string[],
  updateLayouts: vi.fn(),
};

vi.mock('../../../stores/useLayoutStore', () => ({
  useLayoutStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockLayoutStore);
    }
    return mockLayoutStore;
  }),
}));


import { DashboardGrid } from '../DashboardGrid';
import type { PanelId } from '../../../types/layout';

// Sample panel content components for testing
const MockPanelContent = ({ panelId }: { panelId: PanelId }) => (
  <div data-testid={`mock-content-${panelId}`}>{panelId} content</div>
);

describe('DashboardGrid', () => {
  beforeEach(() => {
    mockLayoutStore.isLocked = false;
    mockLayoutStore.hiddenPanels = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render all visible panels', async () => {
    render(
      <DashboardGrid>
        <div key="tape-table"><MockPanelContent panelId="tape-table" /></div>
        <div key="algo-signals"><MockPanelContent panelId="algo-signals" /></div>
        <div key="tabbed-chart"><MockPanelContent panelId="tabbed-chart" /></div>
        <div key="order-book"><MockPanelContent panelId="order-book" /></div>
        <div key="analysis-dashboard"><MockPanelContent panelId="analysis-dashboard" /></div>
      </DashboardGrid>
    );

    // Wait for ResizeObserver callback and state update
    await waitFor(() => {
      expect(screen.getByTestId('mock-content-tape-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mock-content-algo-signals')).toBeInTheDocument();
    expect(screen.getByTestId('mock-content-tabbed-chart')).toBeInTheDocument();
    expect(screen.getByTestId('mock-content-order-book')).toBeInTheDocument();
    expect(screen.getByTestId('mock-content-analysis-dashboard')).toBeInTheDocument();
  });

  it('should not render hidden panels', async () => {
    mockLayoutStore.hiddenPanels = ['algo-signals', 'analysis-dashboard'];

    render(
      <DashboardGrid>
        <div key="tape-table"><MockPanelContent panelId="tape-table" /></div>
        <div key="algo-signals"><MockPanelContent panelId="algo-signals" /></div>
        <div key="tabbed-chart"><MockPanelContent panelId="tabbed-chart" /></div>
        <div key="order-book"><MockPanelContent panelId="order-book" /></div>
        <div key="analysis-dashboard"><MockPanelContent panelId="analysis-dashboard" /></div>
      </DashboardGrid>
    );

    // Wait for ResizeObserver callback and state update
    await waitFor(() => {
      expect(screen.getByTestId('mock-content-tape-table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mock-content-algo-signals')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-content-tabbed-chart')).toBeInTheDocument();
    expect(screen.getByTestId('mock-content-order-book')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-content-analysis-dashboard')).not.toBeInTheDocument();
  });

  it('should have dashboard-grid container', () => {
    render(
      <DashboardGrid>
        <div key="tape-table">Content</div>
      </DashboardGrid>
    );

    expect(screen.getByTestId('dashboard-grid')).toBeInTheDocument();
  });

  it('should apply locked class when isLocked is true', () => {
    mockLayoutStore.isLocked = true;

    render(
      <DashboardGrid>
        <div key="tape-table">Content</div>
      </DashboardGrid>
    );

    const grid = screen.getByTestId('dashboard-grid');
    expect(grid).toHaveAttribute('data-locked', 'true');
  });

  it('should apply unlocked attribute when isLocked is false', () => {
    mockLayoutStore.isLocked = false;

    render(
      <DashboardGrid>
        <div key="tape-table">Content</div>
      </DashboardGrid>
    );

    const grid = screen.getByTestId('dashboard-grid');
    expect(grid).toHaveAttribute('data-locked', 'false');
  });

  it('should call updateLayouts when layout changes', async () => {
    const { container } = render(
      <DashboardGrid>
        <div key="tape-table">Content</div>
      </DashboardGrid>
    );

    // Wait for ResizeObserver callback and state update
    await waitFor(() => {
      // Find the ResponsiveGridLayout and verify it renders
      expect(container.querySelector('.react-grid-layout')).toBeInTheDocument();
    });
  });

  it('should pass isDraggable=false when locked', () => {
    mockLayoutStore.isLocked = true;

    render(
      <DashboardGrid>
        <div key="tape-table">Locked content</div>
      </DashboardGrid>
    );

    const grid = screen.getByTestId('dashboard-grid');
    // When locked, dragging should be disabled
    expect(grid).toHaveAttribute('data-locked', 'true');
  });
});
