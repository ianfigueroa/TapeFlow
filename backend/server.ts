// WebSocket server - bridges Binance streams to frontend clients

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BinanceAdapter } from './adapters';
import { Trade, OrderBook, Ticker, ClientMessage, ServerMessage } from './types';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Allow requests from the Vite dev server
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Singleton adapter - we reuse one connection to Binance for all clients
let binanceAdapter: BinanceAdapter | null = null;

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
    ],
  });
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
