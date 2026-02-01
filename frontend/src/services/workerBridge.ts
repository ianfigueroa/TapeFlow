/**
 * Worker Bridge - Connects the Data Worker to React components
 * 
 * This service manages the Web Worker lifecycle and distributes
 * computed data to subscribed components at a throttled rate.
 * 
 * Key Responsibilities:
 * - Singleton Worker instance management
 * - Subscription-based data distribution
 * - No calculations on main thread - worker does all processing
 */

import type { AggregatedData, WorkerMessage, WorkerResponse } from '../workers/data.worker';

// Listener type for components to subscribe to data updates
type DataListener = (data: AggregatedData) => void;
type ConnectionListener = (isConnected: boolean) => void;
type ErrorListener = (error: string) => void;

// Singleton state
let worker: Worker | null = null;
let isConnected = false;
let currentData: AggregatedData | null = null;
let currentSymbol: string | null = null;

// Subscription sets
const dataListeners = new Set<DataListener>();
const connectionListeners = new Set<ConnectionListener>();
const errorListeners = new Set<ErrorListener>();

/**
 * Initialize the worker (call once on app startup)
 */
export function initializeWorker(): void {
  if (worker) {
    console.warn('[WorkerBridge] Worker already initialized');
    return;
  }

  try {
    worker = new Worker(
      new URL('../workers/data.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'connected':
          isConnected = true;
          connectionListeners.forEach(listener => listener(true));
          break;

        case 'disconnected':
          isConnected = false;
          connectionListeners.forEach(listener => listener(false));
          break;

        case 'error':
          const errorMsg = payload as string;
          errorListeners.forEach(listener => listener(errorMsg));
          break;

        case 'data':
          currentData = payload as AggregatedData;
          // Distribute to all listeners
          dataListeners.forEach(listener => {
            try {
              listener(currentData!);
            } catch (e) {
              console.error('[WorkerBridge] Listener error:', e);
            }
          });
          break;
      }
    };

    worker.onerror = (error) => {
      const msg = `Worker error: ${error.message}`;
      errorListeners.forEach(listener => listener(msg));
    };

    console.log('[WorkerBridge] Worker initialized');
  } catch (error) {
    console.error('[WorkerBridge] Failed to initialize worker:', error);
  }
}

/**
 * Connect to the WebSocket server via the worker
 */
export function connectWorker(url?: string): void {
  if (!worker) {
    initializeWorker();
  }
  worker?.postMessage({ type: 'connect', payload: { url } } as WorkerMessage);
}

/**
 * Disconnect the worker
 */
export function disconnectWorker(): void {
  worker?.postMessage({ type: 'disconnect' } as WorkerMessage);
}

/**
 * Subscribe to a symbol's market data
 */
export function subscribeSymbol(symbol: string): void {
  if (!worker) {
    initializeWorker();
  }
  currentSymbol = symbol.toUpperCase();
  worker?.postMessage({ type: 'subscribe', payload: { symbol: currentSymbol } } as WorkerMessage);
}

/**
 * Set the candle/footprint interval
 */
export function setInterval(intervalMs: number): void {
  worker?.postMessage({ type: 'setInterval', payload: { intervalMs } } as WorkerMessage);
}

/**
 * Set the price tick size for footprint
 */
export function setTickSize(tickSize: number): void {
  worker?.postMessage({ type: 'setTickSize', payload: { tickSize } } as WorkerMessage);
}

/**
 * Reset all aggregated data
 */
export function resetWorkerData(): void {
  worker?.postMessage({ type: 'reset' } as WorkerMessage);
}

/**
 * Subscribe to data updates
 * Returns unsubscribe function
 */
export function subscribeToData(listener: DataListener): () => void {
  dataListeners.add(listener);
  
  // Immediately call with current data if available
  if (currentData) {
    try {
      listener(currentData);
    } catch (e) {
      console.error('[WorkerBridge] Initial listener error:', e);
    }
  }

  return () => {
    dataListeners.delete(listener);
  };
}

/**
 * Subscribe to connection status changes
 */
export function subscribeToConnection(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  // Immediately notify of current state
  listener(isConnected);
  return () => {
    connectionListeners.delete(listener);
  };
}

/**
 * Subscribe to errors
 */
export function subscribeToErrors(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

/**
 * Get current data snapshot (for components that need immediate access)
 */
export function getCurrentData(): AggregatedData | null {
  return currentData;
}

/**
 * Get current connection status
 */
export function getIsConnected(): boolean {
  return isConnected;
}

/**
 * Get current subscribed symbol
 */
export function getCurrentSymbol(): string | null {
  return currentSymbol;
}

/**
 * Terminate the worker (call on app shutdown)
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    isConnected = false;
    currentData = null;
    currentSymbol = null;
    dataListeners.clear();
    connectionListeners.clear();
    errorListeners.clear();
    console.log('[WorkerBridge] Worker terminated');
  }
}

// Export types for consumers
export type { AggregatedData } from '../workers/data.worker';
