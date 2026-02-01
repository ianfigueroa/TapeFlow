import '@testing-library/jest-dom';

// Mock requestAnimationFrame for testing
let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalObj = globalThis as any;

globalObj.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  rafCallbacks.push(callback);
  return ++rafId;
};

globalObj.cancelAnimationFrame = (_id: number): void => {
  // Simple implementation - in real tests we might need more sophisticated tracking
};

// Helper to flush RAF callbacks (for tests)
export function flushRAF(): void {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  const time = performance.now();
  callbacks.forEach(cb => cb(time));
}

// Helper to get pending RAF count
export function getPendingRAFCount(): number {
  return rafCallbacks.length;
}

// Helper to clear RAF queue without executing
export function clearRAFQueue(): void {
  rafCallbacks = [];
}

// Make helpers available globally for tests
declare global {
  function flushRAF(): void;
  function getPendingRAFCount(): number;
  function clearRAFQueue(): void;
}

globalObj.flushRAF = flushRAF;
globalObj.getPendingRAFCount = getPendingRAFCount;
globalObj.clearRAFQueue = clearRAFQueue;
