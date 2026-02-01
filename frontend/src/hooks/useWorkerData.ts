/**
 * useWorkerData - React hook for consuming Web Worker aggregated data
 * 
 * This hook subscribes to the worker bridge and provides ready-to-render
 * data structures. Components using this hook do ZERO calculations -
 * everything is offloaded to the Web Worker.
 * 
 * Usage:
 * const { candles, footprint, cvd, sessionStats, isConnected } = useWorkerData(symbol);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeToData,
  subscribeToConnection,
  subscribeSymbol,
  connectWorker,
  getCurrentData,
  getIsConnected,
  type AggregatedData,
} from '../services/workerBridge';

export interface UseWorkerDataOptions {
  symbol: string;
  autoConnect?: boolean;
}

export interface UseWorkerDataReturn {
  // Connection status
  isConnected: boolean;
  isLoading: boolean;
  
  // Aggregated data - ready to render, no processing needed
  trades: AggregatedData['trades'];
  candles: AggregatedData['candles'];
  currentCandle: AggregatedData['currentCandle'];
  footprintClusters: AggregatedData['footprintClusters'];
  currentFootprint: AggregatedData['currentFootprint'];
  volumeProfile: AggregatedData['volumeProfile'];
  
  // CVD values
  cvd: number;
  cvd5m: number;
  cvd15m: number;
  cvd1h: number;
  
  // Session statistics
  sessionStats: AggregatedData['sessionStats'];
  
  // Order book and ticker (passthrough from worker)
  orderBook: AggregatedData['orderBook'];
  ticker: AggregatedData['ticker'];
  
  // Last update timestamp
  lastUpdate: number;
}

const emptySessionStats: AggregatedData['sessionStats'] = {
  sessionOpen: 0,
  sessionHigh: 0,
  sessionLow: Infinity,
  sessionClose: 0,
  totalVolume: 0,
  totalBuyVolume: 0,
  totalSellVolume: 0,
  sessionDelta: 0,
  vwap: 0,
  tradeCount: 0,
  startTime: Date.now(),
};

export function useWorkerData(options: UseWorkerDataOptions): UseWorkerDataReturn {
  const { symbol, autoConnect = true } = options;
  
  const [isConnected, setIsConnected] = useState(getIsConnected());
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<AggregatedData | null>(getCurrentData());
  const lastSymbolRef = useRef<string>('');
  
  // Handle data updates from worker
  const handleData = useCallback((newData: AggregatedData) => {
    // Only update if this data is for our symbol
    if (newData.symbol === symbol.toUpperCase()) {
      setData(newData);
      setIsLoading(false);
    }
  }, [symbol]);
  
  // Subscribe to worker data
  useEffect(() => {
    const unsubscribeData = subscribeToData(handleData);
    const unsubscribeConnection = subscribeToConnection(setIsConnected);
    
    return () => {
      unsubscribeData();
      unsubscribeConnection();
    };
  }, [handleData]);
  
  // Auto-connect and subscribe to symbol
  useEffect(() => {
    if (!symbol) return;
    
    const upperSymbol = symbol.toUpperCase();
    
    // Only resubscribe if symbol changed
    if (upperSymbol !== lastSymbolRef.current) {
      lastSymbolRef.current = upperSymbol;
      setIsLoading(true);
      setData(null);
      
      if (autoConnect) {
        connectWorker();
      }
      subscribeSymbol(upperSymbol);
    }
  }, [symbol, autoConnect]);
  
  // Return memoized data structure
  return {
    isConnected,
    isLoading,
    
    // Trade data
    trades: data?.trades ?? [],
    candles: data?.candles ?? [],
    currentCandle: data?.currentCandle ?? null,
    footprintClusters: data?.footprintClusters ?? [],
    currentFootprint: data?.currentFootprint ?? null,
    volumeProfile: data?.volumeProfile ?? [],
    
    // CVD
    cvd: data?.cvd ?? 0,
    cvd5m: data?.cvd5m ?? 0,
    cvd15m: data?.cvd15m ?? 0,
    cvd1h: data?.cvd1h ?? 0,
    
    // Session stats
    sessionStats: data?.sessionStats ?? emptySessionStats,
    
    // Passthrough
    orderBook: data?.orderBook ?? null,
    ticker: data?.ticker ?? null,
    
    // Metadata
    lastUpdate: data?.timestamp ?? 0,
  };
}

export default useWorkerData;
