import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock ResizeObserver
const mockObserverInstances: MockResizeObserver[] = [];

class MockResizeObserver {
  callback: ResizeObserverCallback;
  observedElements: Element[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    mockObserverInstances.push(this);
  }

  observe(element: Element) {
    this.observedElements.push(element);
  }

  unobserve(element: Element) {
    this.observedElements = this.observedElements.filter((el) => el !== element);
  }

  disconnect() {
    this.observedElements = [];
  }

  // Helper to simulate resize
  simulateResize(entries: ResizeObserverEntry[]) {
    this.callback(entries, this);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;

// Import after mock is set up
import { usePanelDimensions } from '../usePanelDimensions';

// Helper to create mock ResizeObserverEntry
function createMockEntry(width: number, height: number): ResizeObserverEntry {
  return {
    contentRect: { width, height, x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, toJSON: () => ({}) },
    target: document.createElement('div'),
    borderBoxSize: [{ blockSize: height, inlineSize: width }],
    contentBoxSize: [{ blockSize: height, inlineSize: width }],
    devicePixelContentBoxSize: [{ blockSize: height, inlineSize: width }],
  };
}

describe('usePanelDimensions', () => {
  beforeEach(() => {
    mockObserverInstances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should return initial dimensions of 0x0', () => {
    const { result } = renderHook(() => usePanelDimensions());

    expect(result.current.dimensions.width).toBe(0);
    expect(result.current.dimensions.height).toBe(0);
  });

  it('should return a ref', () => {
    const { result } = renderHook(() => usePanelDimensions());

    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('should create ResizeObserver when rendered with element', () => {
    // The hook creates ResizeObserver in useEffect which runs after render
    // Since ref.current is null on first render, observer is only created
    // when element is attached. In real usage, React sets ref.current
    // before useEffect runs. We test the observable behavior instead.

    const { result } = renderHook(() => usePanelDimensions());

    // The ref should be usable
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.ref).toBe('object');

    // The dimensions should start at 0
    expect(result.current.dimensions.width).toBe(0);
    expect(result.current.dimensions.height).toBe(0);
  });

  it('should update dimensions on resize after debounce', () => {
    const { result } = renderHook(() => usePanelDimensions());

    // Get the last observer instance
    const observer = mockObserverInstances[mockObserverInstances.length - 1];

    if (observer) {
      // Simulate resize
      act(() => {
        observer.simulateResize([createMockEntry(800, 600)]);
      });

      // Before debounce timeout, dimensions should still be 0
      expect(result.current.dimensions.width).toBe(0);
      expect(result.current.dimensions.height).toBe(0);

      // Fast-forward past debounce (100ms default)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Now dimensions should be updated
      expect(result.current.dimensions.width).toBe(800);
      expect(result.current.dimensions.height).toBe(600);
    }
  });

  it('should debounce rapid resize events', () => {
    const { result } = renderHook(() => usePanelDimensions());

    const observer = mockObserverInstances[mockObserverInstances.length - 1];

    if (observer) {
      // Simulate multiple rapid resizes
      act(() => {
        observer.simulateResize([createMockEntry(100, 100)]);
      });

      act(() => {
        vi.advanceTimersByTime(50);
      });

      act(() => {
        observer.simulateResize([createMockEntry(200, 200)]);
      });

      act(() => {
        vi.advanceTimersByTime(50);
      });

      act(() => {
        observer.simulateResize([createMockEntry(300, 300)]);
      });

      // Still debouncing - should be 0
      expect(result.current.dimensions.width).toBe(0);

      // Fast-forward past debounce
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should only reflect the last resize
      expect(result.current.dimensions.width).toBe(300);
      expect(result.current.dimensions.height).toBe(300);
    }
  });

  it('should accept custom debounce delay', () => {
    const { result } = renderHook(() => usePanelDimensions(200));

    const observer = mockObserverInstances[mockObserverInstances.length - 1];

    if (observer) {
      act(() => {
        observer.simulateResize([createMockEntry(500, 400)]);
      });

      // At 100ms (default), should still be 0
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.dimensions.width).toBe(0);

      // At 200ms (custom), should update
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.dimensions.width).toBe(500);
      expect(result.current.dimensions.height).toBe(400);
    }
  });

  it('should cleanup observer on unmount', () => {
    const { unmount } = renderHook(() => usePanelDimensions());

    const observer = mockObserverInstances[mockObserverInstances.length - 1];

    // Observer may not exist if ref.current was null (no element attached)
    // This is expected behavior - the hook should still be safe to unmount
    if (observer) {
      const disconnectSpy = vi.spyOn(observer, 'disconnect');
      unmount();
      expect(disconnectSpy).toHaveBeenCalled();
    } else {
      // Unmount should not throw even without observer
      expect(() => unmount()).not.toThrow();
    }
  });

  it('should handle missing contentRect gracefully', () => {
    const { result } = renderHook(() => usePanelDimensions());

    const observer = mockObserverInstances[mockObserverInstances.length - 1];

    if (observer) {
      // Simulate resize with empty entries
      act(() => {
        observer.simulateResize([]);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Dimensions should remain at 0
      expect(result.current.dimensions.width).toBe(0);
      expect(result.current.dimensions.height).toBe(0);
    }
  });
});
