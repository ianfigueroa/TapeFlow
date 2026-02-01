import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;

import { GridPanel } from '../GridPanel';

describe('GridPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render children', () => {
    render(
      <GridPanel panelId="tape-table">
        <div data-testid="child-content">Content</div>
      </GridPanel>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should have data-panel attribute with panelId', () => {
    render(
      <GridPanel panelId="order-book">
        <div>Test</div>
      </GridPanel>
    );

    const panel = screen.getByTestId('grid-panel-order-book');
    expect(panel).toHaveAttribute('data-panel', 'order-book');
  });

  it('should apply custom className', () => {
    render(
      <GridPanel panelId="tape-table" className="custom-class">
        <div>Test</div>
      </GridPanel>
    );

    const panel = screen.getByTestId('grid-panel-tape-table');
    expect(panel).toHaveClass('custom-class');
  });

  it('should render with render prop pattern for dimensions', () => {
    const renderFn = vi.fn((dimensions) => (
      <div data-testid="rendered-child">
        Width: {dimensions.width}, Height: {dimensions.height}
      </div>
    ));

    render(
      <GridPanel panelId="tabbed-chart">
        {renderFn}
      </GridPanel>
    );

    expect(renderFn).toHaveBeenCalled();
    expect(screen.getByTestId('rendered-child')).toBeInTheDocument();
  });

  it('should provide dimensions object to render prop', () => {
    let capturedDimensions: { width: number; height: number } | null = null;

    render(
      <GridPanel panelId="tabbed-chart">
        {(dimensions) => {
          capturedDimensions = dimensions;
          return <div>Test</div>;
        }}
      </GridPanel>
    );

    expect(capturedDimensions).not.toBeNull();
    expect(capturedDimensions).toHaveProperty('width');
    expect(capturedDimensions).toHaveProperty('height');
    expect(typeof capturedDimensions!.width).toBe('number');
    expect(typeof capturedDimensions!.height).toBe('number');
  });

  it('should fill parent container', () => {
    render(
      <GridPanel panelId="algo-signals">
        <div>Test</div>
      </GridPanel>
    );

    const panel = screen.getByTestId('grid-panel-algo-signals');
    // Check for full-size styling
    expect(panel).toHaveClass('w-full');
    expect(panel).toHaveClass('h-full');
  });

  it('should have overflow hidden', () => {
    render(
      <GridPanel panelId="analysis-dashboard">
        <div>Test</div>
      </GridPanel>
    );

    const panel = screen.getByTestId('grid-panel-analysis-dashboard');
    expect(panel).toHaveClass('overflow-hidden');
  });

  it('should accept ReactNode children (non-function)', () => {
    render(
      <GridPanel panelId="tape-table">
        <span>Static content</span>
        <button>Click me</button>
      </GridPanel>
    );

    expect(screen.getByText('Static content')).toBeInTheDocument();
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
});
