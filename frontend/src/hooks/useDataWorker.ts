/**
 * useDataWorker - React hook for interacting with the data processing Web Worker
 * 
 * Provides a clean interface for components to receive aggregated market data
 * without blocking the main UI thread.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AggregatedData, WorkerMessage, WorkerResponse } from '../workers/data.worker';

// Re-export types for consumers
export type { AggregatedData } from '../workers/data.worker';

export interface UseDataWorkerOptions {
  url?: string;
  symbol?: string;
  intervalMs?: number;
  tickSize?: number;
  autoConnect?: boolean;
}

export interface UseDataWorkerReturn {
  data: AggregatedData | null;
  isConnected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: (symbol: string) => void;
  setInterval: (intervalMs: number) => void;
  setTickSize: (tickSize: number) => void;
  reset: () => void;
}

export function useDataWorker(options: UseDataWorkerOptions = {}): UseDataWorkerReturn {
  const {
    url = 'ws://localhost:9001',
    symbol = 'BTCUSDT',
    intervalMs = 15000,
    tickSize = 10,
    autoConnect = false,
  } = options;

  const workerRef = useRef<Worker | null>(null);
  const [data, setData] = useState<AggregatedData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize worker
  useEffect(() => {
    // Create worker using Vite's worker import syntax
    workerRef.current = new Worker(
      new URL('../workers/data.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'connected':
          setIsConnected(true);
          setError(null);
          break;
        case 'disconnected':
          setIsConnected(false);
          break;
        case 'error':
          setError(payload as string);
          break;
        case 'data':
          setData(payload as AggregatedData);
          break;
      }
    };

    workerRef.current.onerror = (error) => {
      setError(`Worker error: ${error.message}`);
    };

    // Auto-connect if specified
    if (autoConnect) {
      workerRef.current.postMessage({ type: 'connect', payload: { url } } as WorkerMessage);
      workerRef.current.postMessage({ type: 'subscribe', payload: { symbol } } as WorkerMessage);
      workerRef.current.postMessage({ type: 'setInterval', payload: { intervalMs } } as WorkerMessage);
      workerRef.current.postMessage({ type: 'setTickSize', payload: { tickSize } } as WorkerMessage);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Update symbol when it changes
  useEffect(() => {
    if (workerRef.current && isConnected) {
      workerRef.current.postMessage({ type: 'subscribe', payload: { symbol } } as WorkerMessage);
    }
  }, [symbol, isConnected]);

  const connect = useCallback(() => {
    workerRef.current?.postMessage({ type: 'connect', payload: { url } } as WorkerMessage);
  }, [url]);

  const disconnect = useCallback(() => {
    workerRef.current?.postMessage({ type: 'disconnect' } as WorkerMessage);
  }, []);

  const subscribe = useCallback((sym: string) => {
    workerRef.current?.postMessage({ type: 'subscribe', payload: { symbol: sym } } as WorkerMessage);
  }, []);

  const setIntervalMs = useCallback((ms: number) => {
    workerRef.current?.postMessage({ type: 'setInterval', payload: { intervalMs: ms } } as WorkerMessage);
  }, []);

  const setTickSizeValue = useCallback((size: number) => {
    workerRef.current?.postMessage({ type: 'setTickSize', payload: { tickSize: size } } as WorkerMessage);
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' } as WorkerMessage);
  }, []);

  return {
    data,
    isConnected,
    error,
    connect,
    disconnect,
    subscribe,
    setInterval: setIntervalMs,
    setTickSize: setTickSizeValue,
    reset,
  };
}

export default useDataWorker;
