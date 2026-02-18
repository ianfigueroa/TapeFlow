// WebSocket server - bridges Binance streams to frontend clients

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BinanceAdapter, NewsAdapter } from './adapters';
import { Trade, OrderBook, Ticker, ClientMessage, ServerMessage } from './types';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  maxPayload: 16 * 1024, // 16KB max message size
});

// Allow requests from the Vite dev server
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Singleton adapter - we reuse one connection to Binance for all clients
let binanceAdapter: BinanceAdapter | null = null;

// News adapter singleton
const newsAdapter = new NewsAdapter();

// Track what each client is subscribed to so we can clean up properly
const clientSubscriptions: Map<WebSocket, Set<string>> = new Map();

// Track which symbols have at least one subscriber (for cleanup)
const subscribedSymbols: Set<string> = new Set();

console.log('\nTapeFlow Server Starting...');
console.log('Data Source: Binance WebSocket (public API)');
console.log('Supported: USDT perpetual pairs only\n');

/**
 * Lazy-initialize the Binance adapter
 * 
 * We don't connect until the first client subscribes. This avoids
 * wasting bandwidth if the server is running but no one's using it.
 */
async function initBinanceAdapter(): Promise<BinanceAdapter> {
  if (binanceAdapter) return binanceAdapter;
  
  binanceAdapter = new BinanceAdapter({});
  await binanceAdapter.connect();
  
  // Wire up event handlers to broadcast data to subscribed clients
  binanceAdapter.onTrade((trade: Trade) => {
    broadcastToSubscribers(trade.symbol, {
      type: 'trade',
      data: trade,
      timestamp: Date.now(),
    });
  });
  
  binanceAdapter.onOrderBook((orderBook: OrderBook) => {
    broadcastToSubscribers(orderBook.symbol, {
      type: 'orderbook',
      data: orderBook,
      timestamp: Date.now(),
    });
  });
  
  binanceAdapter.onTicker((ticker: Ticker) => {
    broadcastToSubscribers(ticker.symbol, {
      type: 'ticker',
      data: ticker,
      timestamp: Date.now(),
    });
  });
  
  binanceAdapter.onError((error: Error) => {
    console.error('[Binance] Error:', error.message);
  });
  
  binanceAdapter.onDisconnect(() => {
    console.log('[Binance] Disconnected - will attempt reconnect');
  });
  
  return binanceAdapter;
}

/**
 * Send a message to all clients subscribed to a particular symbol
 */
function broadcastToSubscribers(symbol: string, message: ServerMessage): void {
  const upperSymbol = symbol.toUpperCase();
  
  for (const [client, subscriptions] of clientSubscriptions) {
    if (subscriptions.has(upperSymbol) && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

// Handle new client connections
wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');
  clientSubscriptions.set(ws, new Set());
  
  // Let the client know we're ready
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: Date.now(),
  }));
  
  ws.on('message', async (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      
      // Route to appropriate handler based on message type
      switch (message.type) {
        case 'subscribe':
          await handleSubscribe(ws, message);
          break;
        case 'unsubscribe':
          await handleUnsubscribe(ws, message);
          break;
        case 'validate':
          await handleValidate(ws, message);
          break;
        case 'ping':
          // Simple heartbeat - client can use this to check latency
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format',
        timestamp: Date.now(),
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    // Clean up: unsubscribe from any symbols this client was watching
    const subscriptions = clientSubscriptions.get(ws);
    if (subscriptions) {
      for (const symbol of subscriptions) {
        cleanupSymbolSubscription(symbol);
      }
    }
    clientSubscriptions.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

/**
 * Subscribe a client to a symbol's market data
 * 
 * We only support USDT pairs (e.g., BTCUSDT, ETHUSDT) because that's what
 * Binance's spot API gives us. Futures would need a different endpoint.
 */
async function handleSubscribe(ws: WebSocket, message: ClientMessage): Promise<void> {
  const symbols = message.symbols || (message.symbol ? [message.symbol] : []);
  
  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase();
    
    // Reject non-USDT pairs early
    if (!upperSymbol.endsWith('USDT')) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid symbol. Only USDT pairs are supported (e.g., BTCUSDT, ETHUSDT).',
        symbol: upperSymbol,
        timestamp: Date.now(),
      }));
      continue;
    }
    
    // Track this subscription for the client
    const subscriptions = clientSubscriptions.get(ws);
    if (subscriptions) {
      subscriptions.add(upperSymbol);
    }
    
    // Start streaming data from Binance
    const adapter = await initBinanceAdapter();
    await adapter.subscribe(upperSymbol, 'crypto');
    subscribedSymbols.add(upperSymbol);
    
    // Confirm subscription to client
    ws.send(JSON.stringify({
      type: 'subscribed',
      symbol: upperSymbol,
      source: 'binance',
      assetType: 'crypto',
      timestamp: Date.now(),
    }));
    
    console.log(`Subscribed to ${upperSymbol}`);
  }
}

/**
 * Unsubscribe a client from a symbol
 */
async function handleUnsubscribe(ws: WebSocket, message: ClientMessage): Promise<void> {
  const symbols = message.symbols || (message.symbol ? [message.symbol] : []);
  
  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase();
    
    // Remove from this client's subscription list
    const subscriptions = clientSubscriptions.get(ws);
    if (subscriptions) {
      subscriptions.delete(upperSymbol);
    }
    
    // If no clients are watching this symbol anymore, stop the Binance stream
    cleanupSymbolSubscription(upperSymbol);
    
    ws.send(JSON.stringify({
      type: 'unsubscribed',
      symbol: upperSymbol,
      timestamp: Date.now(),
    }));
    
    console.log(`Unsubscribed from ${upperSymbol}`);
  }
}

/**
 * Check if anyone is still watching a symbol, and if not, unsubscribe from Binance
 * 
 * This prevents us from keeping unnecessary streams open when all clients have
 * switched to different symbols.
 */
function cleanupSymbolSubscription(symbol: string): void {
  const upperSymbol = symbol.toUpperCase();
  
  // See if any client is still subscribed
  let hasSubscribers = false;
  for (const [_, subscriptions] of clientSubscriptions) {
    if (subscriptions.has(upperSymbol)) {
      hasSubscribers = true;
      break;
    }
  }
  
  // No one watching? Shut down the Binance stream for this symbol
  if (!hasSubscribers && binanceAdapter) {
    binanceAdapter.unsubscribe(upperSymbol);
    subscribedSymbols.delete(upperSymbol);
  }
}

/**
 * Validate a symbol before subscribing
 * 
 * Client can use this to check if a symbol exists and is actively trading
 * before committing to a subscription. Hits Binance's exchangeInfo endpoint.
 */
async function handleValidate(ws: WebSocket, message: ClientMessage): Promise<void> {
  const symbol = message.symbol?.toUpperCase();
  
  if (!symbol) {
    ws.send(JSON.stringify({
      type: 'validation',
      data: { valid: false, error: 'No symbol provided' },
      timestamp: Date.now(),
    }));
    return;
  }
  
  // Quick check before hitting the API
  if (!symbol.endsWith('USDT')) {
    ws.send(JSON.stringify({
      type: 'validation',
      data: {
        symbol,
        valid: false,
        error: 'Only USDT pairs are supported',
        assetType: 'crypto',
      },
      timestamp: Date.now(),
    }));
    return;
  }
  
  try {
    const adapter = await initBinanceAdapter();
    const validation = await adapter.validateSymbol(symbol);
    ws.send(JSON.stringify({
      type: 'validation',
      data: validation,
      timestamp: Date.now(),
    }));
  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'validation',
      data: {
        symbol,
        valid: false,
        error: error.message || 'Validation failed',
        assetType: 'crypto',
      },
      timestamp: Date.now(),
    }));
  }
}

// Simple health check - useful for monitoring and load balancers
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    dataSource: 'binance',
    activeConnections: clientSubscriptions.size,
    subscribedSymbols: Array.from(subscribedSymbols),
  });
});

// API info for humans poking around
app.get('/api/info', (req, res) => {
  res.json({
    name: 'TapeFlow',
    dataSource: 'Binance WebSocket API',
    supportedPairs: 'USDT perpetual futures',
    features: [
      'Real-time trades',
      'Level 2 order book (20 levels)',
      '24hr ticker statistics',
      'Cryptocurrency news feed',
    ],
  });
});

// News endpoint - fetch crypto news by symbol
app.get('/api/news/:symbol?', async (req, res) => {
  try {
    const symbol = req.params.symbol || 'BTC';
    const forceRefresh = req.query.refresh === 'true';
    
    const news = await newsAdapter.getNews(symbol, forceRefresh);
    
    res.json({
      symbol: symbol.toUpperCase().replace('USDT', ''),
      count: news.length,
      items: news,
      cached: !forceRefresh,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch news',
      message: error.message,
      timestamp: Date.now(),
    });
  }
});

// News stats endpoint
app.get('/api/news-stats', (req, res) => {
  res.json({
    ...newsAdapter.getStats(),
    timestamp: Date.now(),
  });
});

// Binance Futures API proxy endpoints
// These proxy requests to avoid CORS issues when fetching from the frontend
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

// Input validation for Binance API proxy
const SYMBOL_REGEX = /^[A-Z0-9]{2,20}$/;
const VALID_PERIODS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];
const MAX_LIMIT = 500;

function validateSymbol(symbol: unknown): string | null {
  if (typeof symbol !== 'string') return null;
  const upper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return SYMBOL_REGEX.test(upper) ? upper : null;
}

// Simple in-memory rate limiter for Binance proxy endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

app.get('/api/binance/openInterest', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    const symbol = validateSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol format' });
    }

    const url = new URL(`${BINANCE_FUTURES_API}/openInterest`);
    url.searchParams.set('symbol', symbol);

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('[Binance Proxy] openInterest error:', error.message);
    res.status(500).json({ error: 'Failed to fetch open interest' });
  }
});

app.get('/api/binance/longShortRatio', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    const symbol = validateSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol format' });
    }

    const period = VALID_PERIODS.includes(req.query.period as string)
      ? req.query.period as string
      : '5m';
    const limitNum = Math.min(Math.max(1, parseInt(req.query.limit as string) || 1), MAX_LIMIT);

    const url = new URL(`${BINANCE_FUTURES_API}/globalLongShortAccountRatio`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', period);
    url.searchParams.set('limit', String(limitNum));

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('[Binance Proxy] longShortRatio error:', error.message);
    res.status(500).json({ error: 'Failed to fetch long/short ratio' });
  }
});

app.get('/api/binance/premiumIndex', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    const symbol = validateSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol format' });
    }

    const url = new URL(`${BINANCE_FUTURES_API}/premiumIndex`);
    url.searchParams.set('symbol', symbol);

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('[Binance Proxy] premiumIndex error:', error.message);
    res.status(500).json({ error: 'Failed to fetch premium index' });
  }
});

// Wire up news broadcaster to WebSocket
newsAdapter.onNews((item) => {
  const message: ServerMessage = {
    type: 'news',
    data: item,
    timestamp: Date.now(),
  };
  
  // Broadcast to all connected clients
  for (const [client, _] of clientSubscriptions) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
});

// Fire it up
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`TapeFlow Server running on port ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health\n`);
});

// Clean shutdown - close client connections and Binance stream gracefully
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  
  for (const [client, _] of clientSubscriptions) {
    client.close();
  }
  
  if (binanceAdapter) {
    await binanceAdapter.disconnect();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
