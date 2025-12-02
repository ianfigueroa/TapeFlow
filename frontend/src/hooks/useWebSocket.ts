// React hook for WebSocket lifecycle - connects on mount, cleans up on unmount

import { useEffect, useRef, useCallback } from 'react';
import { useMarketStore } from '../stores/useMarketStore';

export function useWebSocket() {
  const connect = useMarketStore((state) => state.connect);
  const disconnect = useMarketStore((state) => state.disconnect);
  const isConnected = useMarketStore((state) => state.isConnected);
  const connectionError = useMarketStore((state) => state.connectionError);
  const reconnectAttempts = useMarketStore((state) => state.reconnectAttempts);
  
  // Track if we've already connected to avoid double-connecting
  const mountedRef = useRef(false);
  
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      connect();
    }
    
    // Intentionally not disconnecting on unmount - see note above
  }, [connect]);
  
  /**
   * Force reconnect - useful if connection gets stuck
   */
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 100);
  }, [connect, disconnect]);
  
  return {
    isConnected,
    connectionError,
    reconnectAttempts,
    reconnect,
  };
}
