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
Web Worker (data.worker.ts)          <-- Offloads main thread
    |
    +---> JSON Parsing
    +---> Trade Aggregation (100ms buckets)
    +---> Candlestick OHLC Calculation
    +---> Volume Profile Generation
    +---> CVD Calculation
    +---> 10Hz Throttled Output
    |
    v
React Components (via useDataWorker hook)
    |
    +---> TapeTable (virtualized, @tanstack/react-virtual)
    +---> FootprintChart (canvas, heatmap coloring)
    +---> CandlestickChart (canvas, proper OHLC + wicks)
    +---> OrderBook (100ms interval)
    +---> OIMonitor (sparkline, 5-min delta)
    +---> SessionStats (VWAP, session high/low, delta)
```

### Why Web Workers Over Main Thread

At 500+ trades/second, processing on the main thread causes:

- JSON parsing blocking UI updates
- GC pressure from rapid object creation
- Frame drops below 10fps during market volatility

Solution: Move all data processing to a dedicated Web Worker.

```typescript
// data.worker.ts handles:
// - WebSocket connection management
// - JSON parsing (expensive at high frequency)
// - Trade aggregation into 100ms buckets
// - OHLC candlestick calculation
// - Volume profile generation
// - CVD (Cumulative Volume Delta) calculation

// Main thread receives pre-processed data at 10Hz
worker.postMessage({ type: "connect", wsUrl });
worker.onmessage = (e) => {
  // Already aggregated, ready for rendering
  const { trades, candles, volumeProfile, cvd } = e.data;
  updateUI(trades, candles, volumeProfile, cvd);
};
```

Result: Main thread stays at 60fps even during 1000+ msg/sec spikes.

### Canvas Rendering Engine

Single `requestAnimationFrame` loop drives all canvas layers:

```
LayerManager (60fps RAF)
    |
    +---> BackgroundLayer (z:0)   - Grid, axis
    +---> HeatmapLayer (z:10)     - Order book depth, log10 scaling
    +---> FootprintLayer (z:20)   - Cluster charts with heatmap coloring
    |                               (intensity based on volume percentile)
    +---> IndicatorLayer (z:30)   - VWAP, liquidity zones
    +---> OverlayLayer (z:40)     - Crosshair, tooltips
```

Layers register with manager, receive data via `update()`, render via `render(ctx, rc)`.

#### Footprint Heatmap Coloring

Volume cells are colored by intensity relative to the maximum volume in the visible range:

```typescript
// Calculate intensity (0-1) based on global max volume
const intensity = Math.min(volume / globalMaxVolume, 1);

// Color gradient: dark blue -> cyan -> yellow -> white
const getHeatmapColor = (intensity: number): string => {
  if (intensity < 0.25)
    return `rgba(0, ${Math.floor(intensity * 4 * 200)}, 255, 0.8)`;
  if (intensity < 0.5)
    return `rgba(0, 200, ${Math.floor(255 - (intensity - 0.25) * 4 * 200)}, 0.9)`;
  if (intensity < 0.75)
    return `rgba(${Math.floor((intensity - 0.5) * 4 * 255)}, 200, 0, 0.95)`;
  return `rgba(255, ${Math.floor(200 + (intensity - 0.75) * 4 * 55)}, 0, 1.0)`;
};
```

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
new CompositeCondition("AND", [
  new PriceCondition(">", "vwap"),
  new OBICondition(">", 0.5),
]);
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

| Metric           | Target   | Achieved |
| ---------------- | -------- | -------- |
| Trade throughput | 500+/sec | 800+/sec |
| Render rate      | 60fps    | 60fps    |
| Input latency    | <16ms    | <10ms    |
| Memory (heap)    | <100MB   | ~80MB    |

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
