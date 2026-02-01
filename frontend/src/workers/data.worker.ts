/**
 * Data Worker - Offloads all intensive data processing from the main UI thread
 * 
 * Responsibilities:
 * - WebSocket connection management
 * - JSON parsing of incoming messages
 * - Candlestick OHLC aggregation
 * - Footprint cluster aggregation
 * - Volume Profile calculation
 * - CVD (Cumulative Volume Delta) calculation
 * - VWAP calculation
 * - Session statistics
 * 
 * Posts aggregated data to main thread at throttled intervals (10 FPS)
 */

// Worker message types
export interface WorkerMessage {
  type: 'connect' | 'disconnect' | 'subscribe' | 'unsubscribe' | 'setInterval' | 'setTickSize' | 'reset';
  payload?: any;
}

export interface WorkerResponse {
  type: 'connected' | 'disconnected' | 'error' | 'data';
  payload?: any;
}

// Trade data from simulation or live feed
interface RawTrade {
  id: string;
  symbol: string;
  timestamp: number;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  isLiquidation?: boolean;
  liquidationSide?: 'long' | 'short';
}

// Aggregated candle data
interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  vwap: number;
  tradeCount: number;
}

// Footprint cluster data
interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
}

interface FootprintCluster {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Map<number, FootprintLevel>;
  totalVolume: number;
  delta: number;
  poc: number; // Point of Control
}

// Volume Profile node
interface VolumeNode {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

// Session statistics
interface SessionStats {
  sessionOpen: number;
  sessionHigh: number;
  sessionLow: number;
  sessionClose: number;
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  sessionDelta: number;
  vwap: number;
  tradeCount: number;
  startTime: number;
}

// Aggregated data sent to main thread
export interface AggregatedData {
  symbol: string;
  timestamp: number;
  
  // Latest trades (for tape display)
  trades: RawTrade[];
  
  // Candlestick data
  candles: CandleData[];
  currentCandle: CandleData | null;
  
  // Footprint data (serialized for transfer)
  footprintClusters: SerializedFootprintCluster[];
  currentFootprint: SerializedFootprintCluster | null;
  
  // Volume profile
  volumeProfile: VolumeNode[];
  
  // CVD values
  cvd: number;
  cvd5m: number;
  cvd15m: number;
  cvd1h: number;
  
  // Session stats
  sessionStats: SessionStats;
  
  // Order book (passthrough)
  orderBook: any | null;
  
  // Ticker (passthrough)
  ticker: any | null;
}

// Serialized footprint for transfer (Map -> Array)
interface SerializedFootprintCluster {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: { price: number; bidVolume: number; askVolume: number; delta: number }[];
  totalVolume: number;
  delta: number;
  poc: number;
}

// Worker state
class DataWorkerState {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private url = 'ws://localhost:9001';
  private subscribedSymbol = 'BTCUSDT';
  
  // Aggregation settings
  private candleIntervalMs = 15000; // 15 second candles
  private footprintIntervalMs = 15000; // 15 second clusters
  private tickSize = 10; // Price tick size for footprint
  
  // Data buffers
  private tradeBuffer: RawTrade[] = [];
  private maxTradeBuffer = 500;
  
  // Candle aggregation
  private candles: CandleData[] = [];
  private currentCandle: CandleData | null = null;
  private maxCandles = 100;
  
  // Footprint aggregation
  private footprintClusters: FootprintCluster[] = [];
  private currentFootprint: FootprintCluster | null = null;
  private maxClusters = 50;
  
  // Volume profile (session)
  private volumeProfile = new Map<number, VolumeNode>();
  
  // CVD tracking
  private cvdTotal = 0;
  private cvdTrades: { timestamp: number; delta: number }[] = [];
  
  // Session stats
  private sessionStats: SessionStats = {
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
  
  // VWAP calculation
  private vwapSum = 0;
  private vwapVolumeSum = 0;
  
  // Order book and ticker passthrough
  private currentOrderBook: any = null;
  private currentTicker: any = null;
  
  // Throttle interval for posting to main thread
  private postInterval: ReturnType<typeof setInterval> | null = null;
  private lastPostTime = 0;
  private postIntervalMs = 100; // 10 FPS
  
  constructor() {
    this.startPostInterval();
  }
  
  connect(url?: string): void {
    if (url) this.url = url;
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        self.postMessage({ type: 'connected' } as WorkerResponse);
      };
      
      this.ws.onclose = () => {
        this.isConnected = false;
        self.postMessage({ type: 'disconnected' } as WorkerResponse);
        // Auto-reconnect after 2 seconds
        setTimeout(() => this.connect(), 2000);
      };
      
      this.ws.onerror = (error) => {
        self.postMessage({ type: 'error', payload: 'WebSocket error' } as WorkerResponse);
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      self.postMessage({ type: 'error', payload: (error as Error).message } as WorkerResponse);
    }
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
  
  subscribe(symbol: string): void {
    this.subscribedSymbol = symbol.toUpperCase();
    this.reset();
  }
  
  setInterval(intervalMs: number): void {
    this.candleIntervalMs = intervalMs;
    this.footprintIntervalMs = intervalMs;
  }
  
  setTickSize(tickSize: number): void {
    this.tickSize = tickSize;
  }
  
  reset(): void {
    this.tradeBuffer = [];
    this.candles = [];
    this.currentCandle = null;
    this.footprintClusters = [];
    this.currentFootprint = null;
    this.volumeProfile.clear();
    this.cvdTotal = 0;
    this.cvdTrades = [];
    this.sessionStats = {
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
    this.vwapSum = 0;
    this.vwapVolumeSum = 0;
    this.currentOrderBook = null;
    this.currentTicker = null;
  }
  
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Handle telemetry from C++ engine
      if (message.type === 'telemetry') {
        this.processTelemetry(message);
      }
      // Handle individual trade messages
      else if (message.type === 'trade') {
        this.processTrade(message.data);
      }
      // Handle order book updates
      else if (message.type === 'orderbook') {
        this.currentOrderBook = message.data;
      }
      // Handle ticker updates
      else if (message.type === 'ticker') {
        this.currentTicker = message.data;
      }
    } catch (error) {
      // Skip malformed messages
    }
  }
  
  private processTelemetry(telemetry: any): void {
    const symbol = this.subscribedSymbol;
    const timestamp = telemetry.timestamp || Date.now();
    
    // Generate synthetic trades from telemetry
    const tradesPerTick = 20 + Math.floor(Math.random() * 30);
    const priceVariance = (telemetry.spread || 1) * 0.5;
    
    for (let i = 0; i < tradesPerTick; i++) {
      const isBuy = Math.random() > 0.48;
      const priceOffset = (Math.random() - 0.5) * priceVariance;
      const tradePrice = telemetry.price + priceOffset;
      
      // Realistic volume distribution
      const volumeRand = Math.random();
      let volume: number;
      if (volumeRand > 0.99) {
        volume = 1 + Math.random() * 5;
      } else if (volumeRand > 0.9) {
        volume = 0.1 + Math.random() * 0.9;
      } else {
        volume = 0.001 + Math.random() * 0.1;
      }
      
      const trade: RawTrade = {
        id: `trade-${timestamp}-${i}`,
        symbol,
        timestamp: timestamp + i,
        price: Math.round(tradePrice * 100) / 100,
        volume: Math.round(volume * 100000) / 100000,
        side: isBuy ? 'buy' : 'sell',
      };
      
      this.processTrade(trade);
    }
    
    // Update order book from telemetry
    if (telemetry.bids && telemetry.asks) {
      this.currentOrderBook = {
        symbol,
        timestamp,
        bids: telemetry.bids,
        asks: telemetry.asks,
        spread: telemetry.spread || 0,
        spreadPercent: telemetry.spreadPercent || 0,
      };
    }
    
    // Update ticker from telemetry
    this.currentTicker = {
      symbol,
      timestamp,
      lastPrice: telemetry.price,
      highPrice: telemetry.high,
      lowPrice: telemetry.low,
      volume: telemetry.totalTrades || 0,
    };
  }
  
  private processTrade(trade: RawTrade): void {
    // Add to trade buffer
    this.tradeBuffer.unshift(trade);
    if (this.tradeBuffer.length > this.maxTradeBuffer) {
      this.tradeBuffer.pop();
    }
    
    // Update candle
    this.updateCandle(trade);
    
    // Update footprint
    this.updateFootprint(trade);
    
    // Update volume profile
    this.updateVolumeProfile(trade);
    
    // Update CVD
    this.updateCVD(trade);
    
    // Update session stats
    this.updateSessionStats(trade);
    
    // Update VWAP
    this.updateVWAP(trade);
  }
  
  private updateCandle(trade: RawTrade): void {
    const candleTime = Math.floor(trade.timestamp / this.candleIntervalMs) * this.candleIntervalMs;
    
    if (!this.currentCandle || this.currentCandle.timestamp !== candleTime) {
      // Finalize current candle
      if (this.currentCandle) {
        this.candles.push({ ...this.currentCandle });
        if (this.candles.length > this.maxCandles) {
          this.candles.shift();
        }
      }
      
      // Create new candle
      this.currentCandle = {
        timestamp: candleTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        vwap: trade.price,
        tradeCount: 0,
      };
    }
    
    // Update current candle
    const candle = this.currentCandle;
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume += trade.volume;
    candle.tradeCount++;
    
    if (trade.side === 'buy') {
      candle.buyVolume += trade.volume;
    } else {
      candle.sellVolume += trade.volume;
    }
    
    // Update candle VWAP
    if (candle.volume > 0) {
      // Simplified VWAP update
      candle.vwap = (candle.vwap * (candle.volume - trade.volume) + trade.price * trade.volume) / candle.volume;
    }
  }
  
  private updateFootprint(trade: RawTrade): void {
    const clusterTime = Math.floor(trade.timestamp / this.footprintIntervalMs) * this.footprintIntervalMs;
    const priceLevel = Math.round(trade.price / this.tickSize) * this.tickSize;
    
    if (!this.currentFootprint || this.currentFootprint.timestamp !== clusterTime) {
      // Finalize current footprint
      if (this.currentFootprint) {
        this.footprintClusters.push(this.cloneFootprint(this.currentFootprint));
        if (this.footprintClusters.length > this.maxClusters) {
          this.footprintClusters.shift();
        }
      }
      
      // Create new footprint cluster
      this.currentFootprint = {
        timestamp: clusterTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        levels: new Map(),
        totalVolume: 0,
        delta: 0,
        poc: priceLevel,
      };
    }
    
    // Update current footprint
    const fp = this.currentFootprint;
    fp.high = Math.max(fp.high, trade.price);
    fp.low = Math.min(fp.low, trade.price);
    fp.close = trade.price;
    fp.totalVolume += trade.volume;
    
    // Update price level
    let level = fp.levels.get(priceLevel);
    if (!level) {
      level = { price: priceLevel, bidVolume: 0, askVolume: 0, delta: 0 };
      fp.levels.set(priceLevel, level);
    }
    
    if (trade.side === 'buy') {
      level.askVolume += trade.volume;
      fp.delta += trade.volume;
    } else {
      level.bidVolume += trade.volume;
      fp.delta -= trade.volume;
    }
    level.delta = level.askVolume - level.bidVolume;
    
    // Update POC
    let maxVolume = 0;
    for (const [price, lvl] of fp.levels) {
      const totalVol = lvl.bidVolume + lvl.askVolume;
      if (totalVol > maxVolume) {
        maxVolume = totalVol;
        fp.poc = price;
      }
    }
  }
  
  private cloneFootprint(fp: FootprintCluster): FootprintCluster {
    return {
      ...fp,
      levels: new Map(fp.levels),
    };
  }
  
  private updateVolumeProfile(trade: RawTrade): void {
    const priceLevel = Math.round(trade.price / this.tickSize) * this.tickSize;
    
    let node = this.volumeProfile.get(priceLevel);
    if (!node) {
      node = { price: priceLevel, volume: 0, buyVolume: 0, sellVolume: 0 };
      this.volumeProfile.set(priceLevel, node);
    }
    
    node.volume += trade.volume;
    if (trade.side === 'buy') {
      node.buyVolume += trade.volume;
    } else {
      node.sellVolume += trade.volume;
    }
  }
  
  private updateCVD(trade: RawTrade): void {
    const delta = trade.side === 'buy' ? trade.volume : -trade.volume;
    this.cvdTotal += delta;
    
    this.cvdTrades.push({ timestamp: trade.timestamp, delta });
    
    // Keep only last hour of trades for CVD calculation
    const oneHourAgo = Date.now() - 3600000;
    while (this.cvdTrades.length > 0 && this.cvdTrades[0].timestamp < oneHourAgo) {
      this.cvdTrades.shift();
    }
  }
  
  private getCVD(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.cvdTrades
      .filter(t => t.timestamp >= cutoff)
      .reduce((sum, t) => sum + t.delta, 0);
  }
  
  private updateSessionStats(trade: RawTrade): void {
    const stats = this.sessionStats;
    
    if (stats.sessionOpen === 0) {
      stats.sessionOpen = trade.price;
    }
    
    stats.sessionHigh = Math.max(stats.sessionHigh, trade.price);
    stats.sessionLow = Math.min(stats.sessionLow, trade.price);
    stats.sessionClose = trade.price;
    stats.totalVolume += trade.volume;
    stats.tradeCount++;
    
    if (trade.side === 'buy') {
      stats.totalBuyVolume += trade.volume;
    } else {
      stats.totalSellVolume += trade.volume;
    }
    
    stats.sessionDelta = stats.totalBuyVolume - stats.totalSellVolume;
  }
  
  private updateVWAP(trade: RawTrade): void {
    this.vwapSum += trade.price * trade.volume;
    this.vwapVolumeSum += trade.volume;
    
    if (this.vwapVolumeSum > 0) {
      this.sessionStats.vwap = this.vwapSum / this.vwapVolumeSum;
    }
  }
  
  private serializeFootprint(fp: FootprintCluster): SerializedFootprintCluster {
    return {
      timestamp: fp.timestamp,
      open: fp.open,
      high: fp.high,
      low: fp.low,
      close: fp.close,
      levels: Array.from(fp.levels.values()),
      totalVolume: fp.totalVolume,
      delta: fp.delta,
      poc: fp.poc,
    };
  }
  
  private startPostInterval(): void {
    this.postInterval = setInterval(() => {
      this.postData();
    }, this.postIntervalMs);
  }
  
  private postData(): void {
    const now = Date.now();
    if (now - this.lastPostTime < this.postIntervalMs) return;
    this.lastPostTime = now;
    
    // Serialize footprint clusters
    const serializedClusters = this.footprintClusters.map(fp => this.serializeFootprint(fp));
    const serializedCurrent = this.currentFootprint ? this.serializeFootprint(this.currentFootprint) : null;
    
    // Convert volume profile to array
    const volumeProfileArray = Array.from(this.volumeProfile.values())
      .sort((a, b) => b.price - a.price);
    
    const data: AggregatedData = {
      symbol: this.subscribedSymbol,
      timestamp: now,
      trades: this.tradeBuffer.slice(0, 100), // Send latest 100 trades
      candles: [...this.candles],
      currentCandle: this.currentCandle ? { ...this.currentCandle } : null,
      footprintClusters: serializedClusters,
      currentFootprint: serializedCurrent,
      volumeProfile: volumeProfileArray,
      cvd: this.cvdTotal,
      cvd5m: this.getCVD(300000),
      cvd15m: this.getCVD(900000),
      cvd1h: this.getCVD(3600000),
      sessionStats: { ...this.sessionStats },
      orderBook: this.currentOrderBook,
      ticker: this.currentTicker,
    };
    
    self.postMessage({ type: 'data', payload: data } as WorkerResponse);
  }
  
  stopPostInterval(): void {
    if (this.postInterval) {
      clearInterval(this.postInterval);
      this.postInterval = null;
    }
  }
}

// Initialize worker state
const workerState = new DataWorkerState();

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'connect':
      workerState.connect(payload?.url);
      break;
    case 'disconnect':
      workerState.disconnect();
      break;
    case 'subscribe':
      workerState.subscribe(payload?.symbol || 'BTCUSDT');
      break;
    case 'unsubscribe':
      // No action needed for now
      break;
    case 'setInterval':
      workerState.setInterval(payload?.intervalMs || 15000);
      break;
    case 'setTickSize':
      workerState.setTickSize(payload?.tickSize || 10);
      break;
    case 'reset':
      workerState.reset();
      break;
  }
};

// Export for TypeScript
export {};
