// Binance WebSocket adapter - handles trade, order book, and ticker streams

import WebSocket from 'ws';
import axios from 'axios';
import { BaseAdapter } from './base';
import { Trade, OrderBook, Ticker, SymbolInfo, AssetType, OrderBookLevel } from '../types';

interface BinanceConfig {
  apiKey?: string;
  apiSecret?: string;
  testnet?: boolean;
}

export class BinanceAdapter extends BaseAdapter {
  name = 'Binance';
  supportedAssetTypes: AssetType[] = ['crypto'];
  
  private config: BinanceConfig;
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private wsBaseUrl: string;
  private streamId: number = 1;  // Binance uses IDs to match sub/unsub responses
  private subscribedStreams: Set<string> = new Set();

  constructor(config: BinanceConfig = {}) {
    super();
    this.config = config;
    
    // Use testnet URLs if specified (useful for development without hitting rate limits)
    this.baseUrl = config.testnet 
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';
    
    // Combined stream endpoint lets us manage multiple streams on one socket
    this.wsBaseUrl = config.testnet
      ? 'wss://testnet.binance.vision/stream'
      : 'wss://stream.binance.com:9443/stream';
  }

  /**
   * Open WebSocket connection to Binance
   * 
   * We connect to the combined stream endpoint and wait for the socket to open.
   * Individual symbol subscriptions are sent after the connection is established.
   */
  async connect(): Promise<void> {
    console.log('[Binance] Connecting...');
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsBaseUrl);
      
      this.ws.on('open', () => {
        console.log('[Binance] WebSocket opened');
        this.emitConnect();
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error: Error) => {
        console.error('[Binance] WebSocket error:', error);
        this.emitError(error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[Binance] WebSocket closed');
        this.emitDisconnect();
        // Try to reconnect if we didn't intentionally disconnect
        if (this.connected) {
          this.attemptReconnect();
        }
      });

      // Don't hang forever if connection fails
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Parse incoming WebSocket messages and route to appropriate handler
   */
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      
      // Combined stream format wraps data in { stream, data }
      if (msg.stream) {
        this.processStreamData(msg.stream, msg.data);
        return;
      }
      
      // Subscription confirmations come back with the ID we sent
      if (msg.id !== undefined) {
        return; // We don't need to do anything with these
      }
      
      // Some messages come in direct format (not wrapped)
      if (msg.e) {
        this.processEvent(msg);
      }
    } catch (error) {
      console.error('[Binance] Error parsing message:', error);
    }
  }

  /**
   * Process data from a specific stream (combined format)
   */
  private processStreamData(stream: string, data: any): void {
    // Stream names look like "btcusdt@trade" - extract the symbol
    const symbolMatch = stream.match(/^([a-z0-9]+)@/);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : null;
    
    if (stream.includes('@trade')) {
      this.handleTrade({ ...data, s: symbol || data.s });
    } else if (stream.includes('@depth')) {
      this.handleDepthUpdate({ ...data, s: symbol || data.s });
    } else if (stream.includes('@ticker')) {
      this.handleTicker({ ...data, s: symbol || data.s });
    }
  }

  /**
   * Process direct event format (not wrapped in stream object)
   */
  private processEvent(msg: any): void {
    switch (msg.e) {
      case 'trade':
        this.handleTrade(msg);
        break;
      case 'depthUpdate':
        this.handleDepthUpdate(msg);
        break;
      case '24hrTicker':
        this.handleTicker(msg);
        break;
    }
  }

  /**
   * Convert Binance trade message to our Trade format
   * 
   * NORMALIZATION: Transform terse Binance fields into readable typed objects
   * 
   * Input (Binance):
   *   { s: "BTCUSDT", t: 123456, p: "88000.00", q: "0.5", T: 1704067200000, m: true }
   * 
   * Output (TapeFlow):
   *   { symbol: "BTCUSDT", id: "123456", price: 88000, volume: 0.5, 
   *     timestamp: 1704067200000, side: "sell", exchange: "BINANCE" }
   * 
   * The 'm' (isBuyerMaker) field requires inversion:
   * - m=true: Buyer placed a limit order, seller hit it → SELL aggression
   * - m=false: Seller placed a limit order, buyer hit it → BUY aggression
   */
  private handleTrade(msg: any): void {
    const symbol = msg.s;
    const trade: Trade = {
      id: msg.t?.toString() || this.generateTradeId(),
      symbol,
      assetType: 'crypto',
      timestamp: msg.T || msg.E,
      price: parseFloat(msg.p),
      volume: parseFloat(msg.q),
      side: msg.m ? 'sell' : 'buy',  // m=true means buyer is maker, so aggressor is seller
      exchange: 'BINANCE',
    };
    this.emitTrade(trade);
  }

  /**
   * Process order book depth update
   * 
   * Binance's depth20@100ms stream sends complete snapshots (not deltas).
   * Format: { lastUpdateId, bids: [[price, qty], ...], asks: [[price, qty], ...] }
   */
  private handleDepthUpdate(msg: any): void {
    const symbol = msg.s || msg.symbol;
    
    // Handle both snapshot format (bids/asks) and update format (b/a)
    const rawBids = msg.bids || msg.b || [];
    const rawAsks = msg.asks || msg.a || [];
    
    if (rawBids.length === 0 && rawAsks.length === 0) {
      console.log(`[Binance] Empty depth update for ${symbol}:`, msg);
      return;
    }
    
    // Convert string arrays to OrderBookLevel objects, filter out zero-size levels
    const bids: OrderBookLevel[] = rawBids.map((level: string[]) => ({
      price: parseFloat(level[0]),
      size: parseFloat(level[1]),
    })).filter((l: OrderBookLevel) => l.size > 0);

    const asks: OrderBookLevel[] = rawAsks.map((level: string[]) => ({
      price: parseFloat(level[0]),
      size: parseFloat(level[1]),
    })).filter((l: OrderBookLevel) => l.size > 0);

    // Ensure proper ordering: bids high-to-low, asks low-to-high
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    // Calculate spread from best bid/ask
    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    const orderBook: OrderBook = {
      symbol: symbol?.toUpperCase() || 'UNKNOWN',
      assetType: 'crypto',
      timestamp: msg.E || Date.now(),
      bids,
      asks,
      spread,
      spreadPercent,
    };
    
    console.log(`[Binance] Order book update for ${orderBook.symbol}: ${bids.length} bids, ${asks.length} asks, spread: ${spread.toFixed(4)}`);
    this.emitOrderBook(orderBook);
  }

  /**
   * Convert Binance ticker message to our Ticker format
   */
  private handleTicker(msg: any): void {
    const symbol = msg.s;
    
    // Parse all the fields - Binance uses single-letter keys to save bandwidth
    const ticker: Ticker = {
      symbol: symbol?.toUpperCase() || 'UNKNOWN',
      assetType: 'crypto',
      timestamp: msg.E || Date.now(),
      lastPrice: parseFloat(msg.c || msg.lastPrice || 0),
      priceChange: parseFloat(msg.p || msg.priceChange || 0),
      priceChangePercent: parseFloat(msg.P || msg.priceChangePercent || 0),
      highPrice: parseFloat(msg.h || msg.highPrice || 0),
      lowPrice: parseFloat(msg.l || msg.lowPrice || 0),
      volume: parseFloat(msg.v || msg.volume || 0),
      quoteVolume: parseFloat(msg.q || msg.quoteVolume || 0),
      openPrice: parseFloat(msg.o || msg.openPrice || 0),
    };
    
    this.emitTicker(ticker);
  }

  /**
   * Close the WebSocket connection and clean up
   */
  async disconnect(): Promise<void> {
    console.log('[Binance] Disconnecting...');
    
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.subscriptions.clear();
    this.subscribedStreams.clear();
    this.emitDisconnect();
    console.log('[Binance] Disconnected');
  }

  /**
   * Subscribe to market data streams for a symbol
   * 
   * We subscribe to three streams per symbol:
   * - trade: Real-time trade executions
   * - depth20@100ms: Order book snapshots at 10 updates/second
   * - ticker: 24hr rolling statistics
   */
  async subscribe(symbol: string, assetType: AssetType = 'crypto'): Promise<void> {
    // Binance expects lowercase symbols with no separators
    const lowerSymbol = symbol.toLowerCase().replace('/', '').replace('-', '');
    
    // Don't subscribe twice
    if (this.subscriptions.has(lowerSymbol.toUpperCase())) {
      return;
    }
    
    this.subscriptions.add(lowerSymbol.toUpperCase());
    
    const streams = [
      `${lowerSymbol}@trade`,
      `${lowerSymbol}@depth20@100ms`,
      `${lowerSymbol}@ticker`,
    ];
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send subscription request using Binance's SUBSCRIBE method
      this.ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: streams,
        id: this.streamId++,
      }));
      
      streams.forEach(s => this.subscribedStreams.add(s));
    }
    
    console.log(`[Binance] Subscribed to ${lowerSymbol.toUpperCase()} (trade, depth, ticker)`);
    
    // Fetch initial snapshots so we don't have to wait for the first stream update
    this.fetchOrderBookSnapshot(lowerSymbol.toUpperCase());
    this.fetchTickerSnapshot(lowerSymbol.toUpperCase());
  }

  /**
   * Fetch initial order book via REST API
   * 
   * The WebSocket only sends updates - we need to grab the initial state
   * so the UI has something to show immediately.
   */
  private async fetchOrderBookSnapshot(symbol: string): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/depth`, {
        params: { symbol, limit: 20 },
      });
      
      const data = response.data;
      const bids: OrderBookLevel[] = data.bids.map((level: string[]) => ({
        price: parseFloat(level[0]),
        size: parseFloat(level[1]),
      }));
      
      const asks: OrderBookLevel[] = data.asks.map((level: string[]) => ({
        price: parseFloat(level[0]),
        size: parseFloat(level[1]),
      }));

      const bestBid = bids[0]?.price || 0;
      const bestAsk = asks[0]?.price || 0;
      const spread = bestAsk - bestBid;
      const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

      const orderBook: OrderBook = {
        symbol,
        assetType: 'crypto',
        timestamp: Date.now(),
        bids,
        asks,
        spread,
        spreadPercent,
      };
      this.emitOrderBook(orderBook);
    } catch (error) {
      console.error(`[Binance] Error fetching order book for ${symbol}:`, error);
    }
  }

  /**
   * Fetch initial 24hr ticker via REST API
   */
  private async fetchTickerSnapshot(symbol: string): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/ticker/24hr`, {
        params: { symbol },
      });
      
      const data = response.data;
      const ticker: Ticker = {
        symbol,
        assetType: 'crypto',
        timestamp: Date.now(),
        lastPrice: parseFloat(data.lastPrice),
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        highPrice: parseFloat(data.highPrice),
        lowPrice: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume),
        quoteVolume: parseFloat(data.quoteVolume),
        openPrice: parseFloat(data.openPrice),
      };
      this.emitTicker(ticker);
      console.log(`[Binance] Initial ticker for ${symbol}: last=${ticker.lastPrice}, high=${ticker.highPrice}, low=${ticker.lowPrice}, change=${ticker.priceChangePercent}%`);
    } catch (error) {
      console.error(`[Binance] Error fetching ticker for ${symbol}:`, error);
    }
  }

  /**
   * Unsubscribe from a symbol's market data streams
   */
  async unsubscribe(symbol: string): Promise<void> {
    const lowerSymbol = symbol.toLowerCase().replace('/', '').replace('-', '');
    const upperSymbol = lowerSymbol.toUpperCase();
    
    const streams = [
      `${lowerSymbol}@trade`,
      `${lowerSymbol}@depth20@100ms`,
      `${lowerSymbol}@ticker`,
    ];
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'UNSUBSCRIBE',
        params: streams,
        id: this.streamId++,
      }));
      
      streams.forEach(s => this.subscribedStreams.delete(s));
    }
    
    this.subscriptions.delete(upperSymbol);
    console.log(`[Binance] Unsubscribed from ${upperSymbol}`);
  }

  /**
   * Check if a symbol exists and is actively trading on Binance
   * 
   * Hits the exchangeInfo endpoint which returns symbol status.
   * "TRADING" means it's active, anything else means we can't subscribe.
   */
  async validateSymbol(symbol: string): Promise<SymbolInfo> {
    const upperSymbol = symbol.toUpperCase().replace('/', '').replace('-', '');
    
    try {
      const response = await axios.get(`${this.baseUrl}/exchangeInfo`, {
        params: { symbol: upperSymbol },
      });
      
      if (response.data.symbols?.length > 0) {
        const info = response.data.symbols[0];
        return {
          symbol: info.symbol,
          name: `${info.baseAsset}/${info.quoteAsset}`,
          assetType: 'crypto',
          exchange: 'BINANCE',
          valid: info.status === 'TRADING',
          error: info.status !== 'TRADING' ? `Symbol status: ${info.status}` : undefined,
        };
      }
      
      return {
        symbol: upperSymbol,
        name: upperSymbol,
        assetType: 'crypto',
        valid: false,
        error: 'Symbol not found on Binance',
      };
    } catch (error: any) {
      return {
        symbol: upperSymbol,
        name: upperSymbol,
        assetType: 'crypto',
        valid: false,
        error: error.message || 'Failed to validate symbol',
      };
    }
  }
}
