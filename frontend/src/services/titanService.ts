/**
 * Titan.cpp WebSocket Service
 *
 * Connects to the Titan.cpp market data engine for pre-calculated analytics:
 * - VWAP with fixed-point precision
 * - Order book imbalance
 * - Sigma-based whale trade alerts
 *
 * Titan runs as a separate process on port 9001, providing higher performance
 * and more accurate calculations than JavaScript-based processing.
 */

export interface TitanMetrics {
  type: 'metrics';
  book: {
    bestBid: number;
    bestAsk: number;
    spreadBps: number;
    imbalance: number;  // -1 to +1, positive = bid-heavy
  };
  trade: {
    vwap: number;
    buyVolume: number;
    sellVolume: number;
    tradeCount: number;
  };
}

export interface TitanAlert {
  type: 'alert';
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  deviation: number;  // Standard deviations from mean trade size (sigma)
}

export type TitanMessage = TitanMetrics | TitanAlert;

export interface TitanConnectionState {
  isConnected: boolean;
  error: string | null;
  lastMetrics: TitanMetrics | null;
  alerts: TitanAlert[];
}

type MetricsCallback = (metrics: TitanMetrics) => void;
type AlertCallback = (alert: TitanAlert) => void;
type ConnectionCallback = (connected: boolean, error?: string) => void;

const TITAN_WS_URL = import.meta.env.VITE_TITAN_WS_URL || 'ws://localhost:9001';
const MAX_ALERTS = 100;
const RECONNECT_DELAY_BASE = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

class TitanService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private metricsCallbacks: Set<MetricsCallback> = new Set();
  private alertCallbacks: Set<AlertCallback> = new Set();
  private manuallyDisconnected = false;
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private state: TitanConnectionState = {
    isConnected: false,
    error: null,
    lastMetrics: null,
    alerts: [],

  };

  /**
   * Connect to Titan.cpp WebSocket server
   */
  connect(): void {
    if ((this.ws?.readyState === WebSocket.OPEN) || (this.ws?.readyState === WebSocket.CONNECTING)) {
      console.log('[Titan] Already connected');
      return;
      
    }
    this.manuallyDisconnected = false;
    if (this.ws) this.cleanup();

    try {
      console.log(`[Titan] Connecting to ${TITAN_WS_URL}...`);
      this.ws = new WebSocket(TITAN_WS_URL);

      this.ws.onopen = () => {
        console.log('[Titan] Connected');
        this.reconnectAttempts = 0;
        this.state = { ...this.state, isConnected: true, error: null };
        this.notifyConnection(true);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        console.error('[Titan] WebSocket error:', event);
        this.state = { ...this.state, error: 'Connection error' };
      };

      this.ws.onclose = (event) => {
        console.log(`[Titan] Disconnected (code: ${event.code})`);
        this.state = { ...this.state, isConnected: false };
        this.notifyConnection(false, event.reason || undefined);
        if (!this.manuallyDisconnected){
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[Titan] Failed to connect:', error);
      this.state = { ...this.state, error: 'Failed to connect' };
      this.notifyConnection(false, 'Failed to connect');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from Titan and stop reconnection attempts
   */
  disconnect(): void {
    console.log('[Titan] Disconnecting...');
    this.manuallyDisconnected = true;
    this.cleanup();
    this.state = {
      isConnected: false,
      error: null,
      lastMetrics: null,
      alerts: [],
    };
    this.notifyConnection(false);
  }
  

  /**
   * Subscribe to metrics updates
   */
  onMetrics(callback: MetricsCallback): () => void {
    this.metricsCallbacks.add(callback);
    // Immediately send last metrics if available
    if (this.state.lastMetrics) {
      callback(this.state.lastMetrics);
    }
    return () => this.metricsCallbacks.delete(callback);
  }

  /**
   * Subscribe to whale alerts
   */
  onAlert(callback: AlertCallback): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  /**
   * Subscribe to connection state changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    // Immediately notify current state
    callback(this.state.isConnected, this.state.error || undefined);
    return () => this.connectionCallbacks.delete(callback);
  }

  /**
   * Get current connection state
   */
  getState(): TitanConnectionState {
    return { ...this.state };
  }

  /**
   * Get recent alerts
   */
  getAlerts(): TitanAlert[] {
    return [...this.state.alerts];
  }

  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      // Validate message structure
      if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
        console.warn('[Titan] Invalid message structure:', data);
        return;
      }

      if (parsed.type === 'metrics' && this.isValidMetrics(parsed)) {
        this.state = { ...this.state, lastMetrics: parsed };
        this.metricsCallbacks.forEach(cb => cb(parsed));
      } else if (parsed.type === 'alert' && this.isValidAlert(parsed)) {
        // Add to alert history (newest first)
        const alerts = [parsed, ...this.state.alerts].slice(0, MAX_ALERTS);
        this.state = { ...this.state, alerts };
        this.alertCallbacks.forEach(cb => cb(parsed));
      } else {
        console.warn('[Titan] Unknown or invalid message type:', parsed.type);
      }
    } catch (error) {
      console.error('[Titan] Failed to parse message:', error, data);
    }
  }

  /**
   * Type guard for TitanMetrics validation
   */
  private isValidMetrics(obj: unknown): obj is TitanMetrics {
    const m = obj as Record<string, unknown>;
    if (m.type !== 'metrics') return false;

    const book = m.book as Record<string, unknown> | undefined;
    const trade = m.trade as Record<string, unknown> | undefined;

    return (
      typeof book === 'object' && book !== null &&
      typeof book.bestBid === 'number' &&
      typeof book.bestAsk === 'number' &&
      typeof book.spreadBps === 'number' &&
      typeof book.imbalance === 'number' &&
      typeof trade === 'object' && trade !== null &&
      typeof trade.vwap === 'number' &&
      typeof trade.buyVolume === 'number' &&
      typeof trade.sellVolume === 'number' &&
      typeof trade.tradeCount === 'number'
    );
  }

  /**
   * Type guard for TitanAlert validation
   */
  private isValidAlert(obj: unknown): obj is TitanAlert {
    const a = obj as Record<string, unknown>;
    return (
      a.type === 'alert' &&
      (a.side === 'BUY' || a.side === 'SELL') &&
      typeof a.price === 'number' &&
      typeof a.quantity === 'number' &&
      typeof a.deviation === 'number'
    );
  }

  private notifyConnection(connected: boolean, error?: string): void {
    this.connectionCallbacks.forEach(cb => cb(connected, error));
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
     if (this.reconnectTimer) return; // Prevents duplicate timers
      if (this.manuallyDisconnected) return; // Do not schedule reconnect if manually disconnected
    
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[Titan] Max reconnect attempts reached');
      this.state = { ...this.state, error: 'Max reconnect attempts reached' };
      return;
    }
  

    const delay = Math.min( 
    RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts), 30000 //30 sec cap 
    );
    
    console.log(`[Titan] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.state = { ...this.state, error: null }; // Clear previous error
      this.connect();
    }, delay);
  }
}

// Singleton instance
export const titanService = new TitanService();
