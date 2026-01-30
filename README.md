# TapeFlow

Production-grade real-time trading terminal for order flow analysis. Designed for low-latency visualization of high-frequency market data.

## Architecture

### Data Flow

```
Binance WebSocket (500+ msg/sec)
    |
    v
Node.js Proxy (port 3001)
    |
    v
Frontend WebSocket Handler
    |
    +---> Mutable Buffers (non-React)
    |         |
    |         +---> Trade Buffer (circular, 1000 max)
    |         +---> OrderBook Buffer (latest snapshot)
    |         +---> Rate Tracker (OPS sliding window)
    |
    +---> Analytics Engine
              |
              +---> OPS Calculator (binary search, 1000ms window)
              +---> CVD Calculator (session, 1m, 5m, 15m)
              +---> VWAP Calculator (running numerator/denominator)
              +---> OBI Calculator (top-10 level imbalance)
              +---> Spread Analyzer (1-min MA + stdev)
              |
              v
         React Components (60fps polling)
              |
              +---> TapeTable (16ms interval)
              +---> Charts (100ms interval)
              +---> OrderBook (100ms interval)
```

### Why Mutable Refs Over React State

React's reconciliation algorithm runs on every state update. At 500+ trades/second, this creates:
- Render queue saturation
- GC pressure from object creation
- Frame drops below 10fps

Solution: Store high-frequency data in plain JavaScript structures outside React's control.

```typescript
// Bad: triggers re-render on every trade
const [trades, setTrades] = useState<Trade[]>([]);
ws.onmessage = (trade) => setTrades(prev => [trade, ...prev]);

// Good: buffer accumulates, UI polls at 60fps
const buffer: Trade[] = [];
ws.onmessage = (trade) => buffer.push(trade);

useEffect(() => {
  const id = setInterval(() => {
    const batch = buffer.splice(0, buffer.length);
    if (batch.length > 0) setDisplayTrades(batch);
  }, 16);
  return () => clearInterval(id);
}, []);
```

Result: 500 messages/sec in, 60 renders/sec out.

### Canvas Rendering Engine

Single `requestAnimationFrame` loop drives all canvas layers:

```
LayerManager (60fps RAF)
    |
    +---> BackgroundLayer (z:0)   - Grid, axis
    +---> HeatmapLayer (z:10)     - Order book depth, log10 scaling
    +---> FootprintLayer (z:20)   - Cluster charts, POC highlight
    +---> IndicatorLayer (z:30)   - VWAP, liquidity zones
    +---> OverlayLayer (z:40)     - Crosshair, tooltips
```

Layers register with manager, receive data via `update()`, render via `render(ctx, rc)`.

### Analytics Module

Calculators operate on raw data, return computed values. No React dependencies.

```
AnalyticsEngine
    |
    +---> OPSCalculator
    |         - Binary search for window boundary
    |         - Precise 1000ms sliding window
    |         - 10-sample moving average
    |
    +---> CVDCalculator
    |         - Session-level cumulative delta
    |         - Time-bucketed deltas (1m, 5m, 15m)
    |         - Bucket boundaries align to wall clock
    |
    +---> SpreadAnalyzer
    |         - 60-sample circular buffer (1 min)
    |         - Running mean and standard deviation
    |
    +---> OBICalculator
    |         - Top 10 levels: (bid - ask) / (bid + ask)
    |         - Range [-1, 1], bullish/bearish/neutral
    |
    +---> IcebergDetector
    |         - Tracks order sizes at price levels
    |         - Detects refills (size increases post-trade)
    |         - Threshold: 3 refills = iceberg signal
    |
    +---> LiquidityZoneDetector
              - Orders 3x average size
              - Persisting >5 minutes = zone
```

### Alert Engine

User-defined rules evaluated on each data update:

```typescript
// IF Price > VWAP AND OBI > 0.5 THEN alert
new CompositeCondition('AND', [
  new PriceCondition('>', 'vwap'),
  new OBICondition('>', 0.5),
])
```

Conditions: Price, OBI, Volume, OPS, CVD, Composite (AND/OR)

### Replay System

DataSource interface decouples live/replay:

```
DataSource
    |
    +---> LiveSource (WebSocket)
    +---> ReplaySource (recorded session)
              - Playback speed: 1x-100x
              - Seek by timestamp or percent
              - Maintains relative timing
```

SessionRecorder captures trades + OB snapshots for replay.

### Paper Trading

PaperTradingEngine matches orders against real L1:

- Market orders fill at best bid/ask
- Limit orders trigger when price crosses
- Position tracking with average entry
- P&L calculation (realized + unrealized)

## Directory Structure

```
frontend/src/
  engine/           # Canvas rendering
    LayerManager.ts
    layers/
      HeatmapLayer.ts     # log10 intensity scaling
      FootprintLayer.ts   # cluster charts with POC

  analytics/        # Data processing
    AnalyticsEngine.ts
    calculators/
      OPSCalculator.ts    # binary search sliding window
      CVDCalculator.ts    # multi-timeframe delta
      SpreadAnalyzer.ts   # MA + stdev
      OBICalculator.ts    # order book imbalance
    detectors/
      IcebergDetector.ts
      LiquidityZoneDetector.ts

  alerts/           # Custom alert rules
    AlertEngine.ts
    conditions/

  data/             # Data sources
    sources/
      LiveSource.ts
      ReplaySource.ts
    SessionRecorder.ts
    CSVExporter.ts

  paper/            # Paper trading
    PaperTradingEngine.ts

  components/       # React UI
  stores/           # Zustand state
  services/         # Buffer system
```

## Performance

| Metric | Target | Achieved |
|--------|--------|----------|
| Trade throughput | 500+/sec | 800+/sec |
| Render rate | 60fps | 60fps |
| Input latency | <16ms | <10ms |
| Memory (heap) | <100MB | ~80MB |

## Run

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

Open http://localhost:5173

## Stack

- **Frontend**: React 18, TypeScript, Vite, Zustand, Canvas
- **Backend**: Node.js, Express, WebSocket
- **Data**: Binance Spot + Futures streams
- **Simulation**: C++20 Hyperion engine (optional)

## License

MIT
