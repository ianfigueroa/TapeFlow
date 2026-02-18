# TapeFlow Architecture Documentation

A comprehensive guide to the TapeFlow HFT crypto dashboard—every component, data flow, and trading term explained.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Data Flow](#data-flow)
4. [Component Architecture](#component-architecture)
5. [Data Models and Formulas](#data-models-and-formulas)
6. [Trading Terms Glossary](#trading-terms-glossary)
7. [File Structure](#file-structure)
8. [Performance Characteristics](#performance-characteristics)
9. [Simulation Engine](#simulation-engine-hyperion)

---

## System Overview

TapeFlow is a real-time cryptocurrency market data visualization platform designed to handle high-frequency data streams (500+ trades/second) without browser lag. It achieves this through a decoupled architecture that separates data ingestion from UI rendering.

### Core Design Principles

1. **Decoupled Data/UI**: WebSocket data goes into plain JS arrays, not React state
2. **Batched Rendering**: 500 messages/sec → 60 re-renders/sec
3. **Canvas Rendering**: Heavy visualizations bypass DOM for performance
4. **Sliding Windows**: Time-based calculations use efficient rolling buffers

### Layers

**Backend (Node.js):**

- Connects to Binance Spot and Futures WebSocket APIs
- Normalizes and forwards trades, order book, and liquidation events
- Can switch to a C++ simulation engine for synthetic data

**Frontend (React + Vite):**

- Receives data via WebSocket
- Buffers all data in plain JavaScript arrays (not React state)
- Renders charts and tables at 60fps using canvas for performance
- Uses Zustand for user settings and UI state

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TAPEFLOW SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────────┘

                         EXTERNAL DATA SOURCES
        ┌────────────────────────┬────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────────┐
│ BINANCE SPOT  │      │BINANCE FUTURES│      │  HYPERION ENGINE  │
│  WebSocket    │      │   WebSocket   │      │   (C++ Simulator) │
│               │      │               │      │                   │
│ • @trade      │      │ • @aggTrade   │      │ • 700k+ orders/s  │
│ • @depth20    │      │ • @forceOrder │      │ • Trader personas │
│ • @ticker     │      │ • @depth20    │      │ • Port 9001       │
└───────┬───────┘      └───────┬───────┘      └─────────┬─────────┘
        │                      │                        │
        └──────────────────────┼────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Node.js)                                 │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Binance        │    │  Data           │    │  WebSocket      │         │
│  │  Adapter        │───▶│  Normalizer     │───▶│  Server         │         │
│  │                 │    │                 │    │  (Express)      │         │
│  │ • Connection    │    │ • Unified types │    │                 │         │
│  │ • Reconnection  │    │ • Timestamps    │    │ • Port 3001     │         │
│  │ • Error handling│    │ • Validation    │    │ • Broadcasting  │         │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘         │
│                                                         │                   │
└─────────────────────────────────────────────────────────┼───────────────────┘
                                                          │
                                      WebSocket Connection│ws://localhost:3001
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React + Vite)                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     WEB WORKER (data.worker.ts)                      │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ JSON Parsing │  │ Trade Aggr.  │  │ OHLC Calc    │              │   │
│  │  │ (offloaded)  │  │ (100ms bins) │  │ (candles)    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Volume Prof. │  │ CVD Calc     │  │ 10Hz Output  │              │   │
│  │  │ (per candle) │  │ (cumulative) │  │ (throttled)  │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                         useDataWorker hook                                  │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        UI LAYER (React)                              │   │
│  │                                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ TapeTable   │ │ OrderBook   │ │ Footprint   │ │ Candlestick │   │   │
│  │  │ (Virtualized│ │ (L2 Depth)  │ │ (Heatmap)   │ │ (OHLC+Wicks)│   │   │
│  │  │ @tanstack)  │ │             │ │ Canvas      │ │ Canvas      │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │                                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ OI Monitor  │ │ Session     │ │ Liquidation │ │ Imbalance   │   │   │
│  │  │ (Sparkline) │ │ Stats       │ │ Heatmap     │ │ Meter       │   │   │
│  │  │ (5m Delta)  │ │ (VWAP,H/L)  │ │ (15s refresh│ │ (force upd) │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                    Zustand Stores                            │   │   │
│  │  │  • useMarketStore    • useSettingsStore                      │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Titan Integration

TapeFlow integrates with [Titan.cpp](https://github.com/ianfigueroa/Titan), a high-performance C++ market data engine that provides computed analytics.

### Data Flow with Titan

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL DATA SOURCES                                │
└─────────────────────────────────────────────────────────────────────────────┘
        │                                                    │
        │ Binance WebSocket                                  │ Binance WebSocket
        ▼                                                    ▼
┌───────────────────────────┐                    ┌───────────────────────────┐
│      Titan.cpp            │                    │    TapeFlow Backend       │
│     (Port 9001)           │                    │     (Port 3001)           │
│                           │                    │                           │
│  • Maintains order book   │                    │  • Trade normalization    │
│  • Calculates VWAP        │                    │  • Open interest          │
│  • Detects whale trades   │                    │  • Liquidation feed       │
│  • Computes imbalance     │                    │  • News integration       │
└───────────┬───────────────┘                    └───────────┬───────────────┘
            │                                                │
            │ ws://localhost:9001                            │ ws://localhost:3001
            │ (metrics every 500ms)                          │ (trades in real-time)
            └─────────────────────┬──────────────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │    TapeFlow Frontend      │
                    │     (Port 5173)           │
                    │                           │
                    │  • Merges both feeds      │
                    │  • Displays Titan VWAP    │
                    │  • Shows whale alerts     │
                    │  • Renders imbalance      │
                    └───────────────────────────┘
```

### Titan Message Format

**Metrics (every 500ms):**
```json
{
  "type": "metrics",
  "timestamp": "2025-02-18T20:38:23.000Z",
  "book": {
    "bestBid": 67542.20,
    "bestAsk": 67542.30,
    "spreadBps": 0.15,
    "imbalance": 0.17
  },
  "trade": {
    "vwap": 67542.30,
    "buyVolume": 5.2,
    "sellVolume": 3.1,
    "tradeCount": 42
  }
}
```

**Whale Alerts (on detection):**
```json
{
  "type": "alert",
  "timestamp": "2025-02-18T20:38:42.188Z",
  "side": "BUY",
  "price": 67559.30,
  "quantity": 0.318,
  "sigma": 2.3
}
```

### TitanService

The frontend connects to Titan via `titanService.ts`:

```typescript
class TitanService {
  // Connect to Titan WebSocket
  connect(url: string): void;

  // Subscribe to metrics updates
  onMetrics(callback: (metrics: TitanMetrics) => void): () => void;

  // Subscribe to whale alerts
  onAlert(callback: (alert: WhaleAlert) => void): () => void;

  // Connection state
  isConnected: boolean;
}
```

### Fallback Behavior

When Titan is unavailable:
1. TapeFlow shows "Titan Disconnected" in the UI
2. Falls back to internal VWAP calculation (less precise)
3. Whale detection uses simpler threshold-based logic
4. Reconnection attempts every 5 seconds with exponential backoff

---

## Data Flow

### Trade Data Flow

```
Binance @trade
      │
      ▼
┌─────────────────┐
│ Backend Adapter │  Normalizes: { id, price, volume, side, timestamp }
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Trade Buffer   │  Plain JS array, max 500 entries, FIFO
└────────┬────────┘
         │
         ├──────────────────┬──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   TapeTable     │ │   PriceChart    │ │   DeltaChart    │
│   Component     │ │   Component     │ │   Component     │
│   (60fps DOM)   │ │   (Canvas)      │ │   (Canvas)      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Order Book Data Flow

```
Binance @depth20@100ms
         │
         ▼
┌─────────────────┐
│ Backend Adapter │  Normalizes: { bids: [[p,s]...], asks: [[p,s]...] }
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   OB Buffer     │  Latest snapshot only (no history needed)
└────────┬────────┘
         │
         ├──────────────────┐
         ▼                  ▼
┌─────────────────┐ ┌─────────────────┐
│   OrderBook     │ │   OB Heatmap    │
│   Component     │ │   (Canvas)      │
│   (Spread, IMB) │ │   (Time series) │
└─────────────────┘ └─────────────────┘
```

---

## Component Architecture

### Components (frontend/src/components/)

| Component                 | Purpose                                           | Rendering      | Key Features                                    |
| ------------------------- | ------------------------------------------------- | -------------- | ----------------------------------------------- |
| `DashboardLayout.tsx`     | Main layout: header, tabs, split panels           | React DOM      | Theme toggle, mode switch, keyboard shortcuts   |
| `TapeFlowWorkspace.tsx`   | Dockable panel workspace                          | React DOM      | flexlayout-react, save/load layouts, presets    |
| `TapeTable.tsx`           | Real-time trade stream ("tape")                   | React DOM      | Virtualized with @tanstack/react-virtual        |
| `OrderBook.tsx`           | Current order book (bids/asks, spread, imbalance) | React DOM      | Color-coded depth, spread display               |
| `DOMLadder.tsx`           | DOM-style price ladder                            | React DOM      | Bid/ask imbalance bars, current price highlight |
| `FootprintChart.tsx`      | Volume clusters by price level                    | Canvas         | Heatmap coloring by volume intensity            |
| `ChartPanel.tsx`          | TradingView lightweight-charts wrapper            | Canvas         | OHLC candlesticks, volume bars                  |
| `CVDOverlay.tsx`          | Cumulative volume delta chart                     | SVG            | Real-time CVD line, buy/sell totals             |
| `VolumeProfile.tsx`       | Volume at price distribution                      | Canvas         | POC marker, value area                          |
| `OIMonitor.tsx`           | Open Interest tracking                            | React + Canvas | Sparkline, 5-min delta, trend history           |
| `SessionStats.tsx`        | Session analytics panel                           | React DOM      | VWAP, session OHLC, total volume/delta          |
| `LiquidationHeatmap.tsx`  | Estimated liquidation zones                       | Canvas         | 15-second periodic recalculation                |
| `ImbalanceMeter.tsx`      | Bid/ask liquidity imbalance                       | React DOM      | Force update on orderbook changes               |
| `AlgoSignals.tsx`         | Whale/spoof/wall/velocity detection               | React DOM      | Triggers sound and desktop alerts               |
| `ExecutionPanel.tsx`      | Paper trading interface                           | React DOM      | Order entry, position display, trade history    |
| `SettingsPanel.tsx`       | User settings: colors, alerts, trading            | React DOM      | Tabbed interface, profile save/load             |
| `AlertsPanel.tsx`         | Custom alert rule configuration                   | React DOM      | Condition builder, alert presets                |
| `ModeToggle.tsx`          | Switches between live and simulation mode         | React DOM      | LIVE/SIM toggle                                 |
| `RealTimeClock.tsx`       | Current time and connection status                | React DOM      | Exchange time sync                              |
| `SymbolSelector.tsx`      | Modal for adding/selecting symbols                | React DOM      | Search, favorites, recent symbols               |
| `SymbolTab.tsx`           | Tab component for switching symbols               | React DOM      | Close, popout actions                           |
| `QuickSymbolSelector.tsx` | Dropdown for fast symbol switching                | React DOM      | Preset popular pairs                            |

### Hooks (frontend/src/hooks/)

| Hook               | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `useDataWorker.ts` | Manages Web Worker communication, connection state, message handling |
| `useWebSocket.ts`  | Legacy WebSocket hook (being replaced by Web Worker)                 |

### Workers (frontend/src/services/)

| Worker           | Purpose                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `data.worker.ts` | Offloads all data processing: JSON parsing, trade aggregation, OHLC calculation, CVD, volume profile |

### Services (frontend/src/services/)

| Service          | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `dataBuffer.ts`  | Buffers trades, order book, ticker. Implements sliding window for OPS |
| `globalClock.ts` | Single requestAnimationFrame loop for time sync                       |

### Stores (frontend/src/stores/)

| Store                     | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `useMarketStore.ts`       | Market data state (trades, order book, ticker)   |
| `useSettingsStore.ts`     | User preferences (colors, alerts, visualization) |
| `usePaperTradingStore.ts` | Paper trading state (orders, positions, P&L)     |

### Utilities (frontend/src/utils/)

| Utility           | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `AlertManager.ts` | Sound alerts (Web Audio API) and desktop notifications |
| `formatters.ts`   | Price, volume, and time formatting helpers             |

---

## Alert System

TapeFlow includes a centralized alert system for notifying traders of significant market events.

### AlertManager

The AlertManager class handles all alert-related functionality:

```typescript
class AlertManager {
  // Play sound using Web Audio API (no external files needed)
  playSound(type: AlertType): void;

  // Show browser desktop notification
  showDesktopNotification(title: string, body: string, type: AlertType): void;

  // Combined alert with automatic cooldown tracking
  triggerAlert(
    title: string,
    message: string,
    type: AlertType,
    options?: AlertOptions,
  ): void;
}
```

### Sound Generation

Sounds are generated using the Web Audio API with distinct frequencies for each alert type:

| Alert Type | Frequency | Duration | Waveform |
| ---------- | --------- | -------- | -------- |
| Whale      | 600 Hz    | 300ms    | Sine     |
| Break      | 1200 Hz   | 150ms    | Square   |
| Velocity   | 900 Hz    | 200ms    | Sine     |
| Wall       | 400 Hz    | 400ms    | Triangle |
| Spoof      | 1500 Hz   | 100ms    | Sawtooth |

### Alert Flow

```
AlgoSignals Component
        │
        │ detects whale/velocity/spoof/wall
        ▼
┌─────────────────┐
│  AlertManager   │
│  .triggerAlert()│
└────────┬────────┘
         │
         ├─────────────────────────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────┐                   ┌─────────────────┐
│  Check Cooldown │                   │  Check Settings │
│  (5s default)   │                   │  (enabled?)     │
└────────┬────────┘                   └────────┬────────┘
         │                                     │
         │ if passed                           │ if enabled
         ▼                                     ▼
┌─────────────────┐                   ┌─────────────────┐
│  Web Audio API  │                   │  Notification   │
│  playSound()    │                   │  API            │
└─────────────────┘                   └─────────────────┘
```

---

## Paper Trading System

ExecutionPanel provides simulated order execution against real market data.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ExecutionPanel                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Order Entry    │  │  Position       │  │  Trade History  │ │
│  │  Form           │  │  Display        │  │  Table          │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    usePaperTradingStore                          │
│                                                                  │
│  State:                      Actions:                            │
│  • balance: number           • openPosition(side, size, price)   │
│  • position: Position|null   • closePosition(price)              │
│  • orders: Order[]           • placeOrder(order)                 │
│  • history: Trade[]          • cancelOrder(id)                   │
│  • settings: TradingSettings • updateSettings(settings)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Order Execution

```typescript
// Market orders fill immediately at current price + slippage
const fillPrice =
  side === "buy"
    ? currentPrice * (1 + slippageBps / 10000)
    : currentPrice * (1 - slippageBps / 10000);

// Apply trading fee
const fee = notionalValue * (feeBps / 10000);
```

### Risk Controls

| Setting           | Description                    | Default |
| ----------------- | ------------------------------ | ------- |
| Max Position Size | Maximum USD value per position | $10,000 |
| Stop Loss         | Auto-close at percentage loss  | 5%      |
| Daily Loss Limit  | Stop trading after daily loss  | $1,000  |
| Slippage          | Simulated slippage in bps      | 5 bps   |
| Fee               | Simulated trading fee in bps   | 4 bps   |

---

## Workspace Layout System

TapeFlow uses flexlayout-react for a professional dockable panel system.

### Layout Model

```typescript
interface IJsonModel {
  global: {
    tabEnableClose: boolean;
    tabEnableDrag: boolean;
    splitterSize: number;
    enableEdgeDock: boolean;
  };
  borders: BorderNode[]; // Collapsible edge panels
  layout: RowNode; // Main content area
}
```

### Layout Persistence

```
User Action                    Storage
     │                            │
     │ drag/resize panel          │
     ▼                            │
┌──────────────┐                  │
│ FlexLayout   │                  │
│ onModelChange│                  │
└──────┬───────┘                  │
       │                          │
       ▼                          ▼
┌──────────────┐         ┌──────────────┐
│ Serialize to │────────▶│ localStorage │
│ JSON model   │         │ tapeflow-    │
└──────────────┘         │ workspace-   │
                         │ layout       │
                         └──────────────┘
```

### Layout Versioning

When new panels are added, the layout version is bumped to ensure users receive the updated default:

```typescript
const CURRENT_LAYOUT_VERSION = 11;

// On app load
const savedVersion = localStorage.get(LAYOUT_VERSION_KEY);
if (savedVersion < CURRENT_LAYOUT_VERSION) {
  // Reset to new default layout
  localStorage.remove(LAYOUT_STORAGE_KEY);
}
```

---

## Data Models and Formulas

### Trade Model

```typescript
type Trade = {
  id: string;
  price: number;
  volume: number;
  side: "buy" | "sell"; // Aggressor side
  timestamp: number;
  isLiquidation?: boolean;
  liquidationSide?: "long" | "short";
};
```

**Example:**

| id        | price   | volume | side | timestamp  | isLiquidation | liquidationSide |
| --------- | ------- | ------ | ---- | ---------- | ------------- | --------------- |
| 123456789 | 42000.5 | 0.25   | buy  | 1700000000 | false         | -               |
| 123456790 | 41990.0 | 1.5    | sell | 1700000001 | true          | long            |

### OrderBook Model

```typescript
type OrderBook = {
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
  timestamp: number;
};
```

**Example:**

| Bids (Price, Size) | Asks (Price, Size) |
| ------------------ | ------------------ |
| 41990, 2.0         | 42010, 1.5         |
| 41980, 1.0         | 42020, 0.5         |

### Liquidation Model

```typescript
type Liquidation = {
  id: string;
  price: number;
  volume: number;
  side: "long" | "short";
  timestamp: number;
};
```

---

### VWAP (Volume Weighted Average Price)

**Formula:**

```
VWAP = Σ(Price × Volume) / Σ(Volume)
```

**Example:**

| Price | Volume |
| ----- | ------ |
| 100   | 10     |
| 101   | 5      |
| 99    | 15     |

```
VWAP = (100×10 + 101×5 + 99×15) / (10+5+15)
     = (1000 + 505 + 1485) / 30
     = 2990 / 30
     = 99.67
```

### CVD (Cumulative Volume Delta)

**Formula:**

```
CVD = Σ(Buy Volume - Sell Volume) over time
```

**Example:**

| Trade | Side | Volume | Running CVD |
| ----- | ---- | ------ | ----------- |
| 1     | buy  | 0.5    | +0.5        |
| 2     | sell | 0.3    | +0.2        |
| 3     | buy  | 0.8    | +1.0        |
| 4     | sell | 1.2    | -0.2        |

### OPS (Orders Per Second)

**How it works:**

Keep a rolling array of trade timestamps. At any moment:

```
OPS = count of trades where (now - timestamp) < 1000ms
```

**Typical values:**

| Market State | OPS      |
| ------------ | -------- |
| Quiet        | 10-50    |
| Active       | 100-200  |
| Volatile     | 300-500+ |

### Imbalance (IMB)

**Formula:**

```
IMB = (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)
```

**Example:**

```
Bid Volume (top 5 levels): 50
Ask Volume (top 5 levels): 30
IMB = (50 - 30) / (50 + 30) = 0.25 (25% more buy volume)
```

Range: -1.0 (all asks) to +1.0 (all bids)

---

## Trading Terms Glossary

### Aggressor / Taker

The trader who initiates a trade by crossing the spread (e.g., a market buy that hits the best ask).

### Bid / Ask

- **Bid:** The highest price a buyer is willing to pay
- **Ask:** The lowest price a seller is willing to accept

### Spread

The difference between the best ask and best bid.

```
Best Ask: 100.01
Best Bid: 99.99
Spread: 0.02
```

### Mid Price

The average of the best bid and best ask.

```
Mid = (Best Bid + Best Ask) / 2
```

### Liquidation

When a leveraged position is force-closed by the exchange because the trader's margin is insufficient.

### Spoof

A large order placed to create a false impression of market interest, then quickly cancelled. TapeFlow detects orders that vanish within 2 seconds.

### Wall

A large resting order that acts as support or resistance in the order book.

### Heatmap

In TapeFlow, the heatmap shows liquidity at each price level over time:

```
Price  ←─── Time ───→
(Asks)
$100.03  ░░▓▓░░░▓▓▓▓░░░░
$100.02  ░░░░██░░░░░░░▓▓  ◄── Large wall appeared
$100.01  ░░░░░░░░░░░░░░░
─────────────────────────── Mid Price
$99.99   ░░░░░░░░░░░░░░░
$99.98   ░▓▓▓░░░░░░████░  ◄── Buy wall building
$99.97   ░░░░░░▓▓░░░░░░░
(Bids)

Color Scale:
░ = Low liquidity (dark blue/black)
▓ = Medium liquidity
█ = High liquidity / WALL (yellow/white)
```

---

## File Structure

```
TapeFlow/
├── backend/                    # Node.js WebSocket proxy
│   ├── server.ts               # Express + WS server
│   ├── types.ts                # Shared type definitions
│   └── adapters/
│       ├── base.ts             # Abstract adapter interface
│       ├── binance.ts          # Binance Spot + Futures adapter
│       └── index.ts            # Adapter exports
│
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── DashboardLayout.tsx
│   │   │   ├── TapeTable.tsx       # Virtualized trade tape
│   │   │   ├── OrderBook.tsx
│   │   │   ├── OrderBookHeatmap.tsx
│   │   │   ├── FootprintChart.tsx  # With heatmap coloring
│   │   │   ├── CandlestickChart.tsx # OHLC with wicks
│   │   │   ├── OIMonitor.tsx       # Sparkline + 5-min delta
│   │   │   ├── ImbalanceMeter.tsx  # Force update pattern
│   │   │   ├── LiquidationHeatmap.tsx # 15s periodic refresh
│   │   │   ├── AlgoSignals.tsx
│   │   │   ├── ChartPanel.tsx
│   │   │   ├── SymbolHeader.tsx
│   │   │   ├── SymbolSelector.tsx
│   │   │   ├── SymbolTab.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModeToggle.tsx
│   │   │   ├── RealTimeClock.tsx
│   │   │   └── dashboard/
│   │   │       └── AnalysisDashboard.tsx # Session Stats panel
│   │   │
│   │   ├── services/           # Data management
│   │   │   ├── dataBuffer.ts
│   │   │   ├── data.worker.ts      # Web Worker for data processing
│   │   │   └── globalClock.ts
│   │   │
│   │   ├── stores/             # Zustand state
│   │   │   ├── useMarketStore.ts
│   │   │   └── useSettingsStore.ts
│   │   │
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useWebSocket.ts
│   │   │   └── useDataWorker.ts    # Web Worker communication
│   │   │
│   │   ├── adapters/           # Data source adapters
│   │   │   ├── MarketDataProvider.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── engine/             # Canvas rendering engine
│   │   │   ├── CanvasEngine.ts
│   │   │   ├── LayerManager.ts
│   │   │   └── layers/
│   │   │       ├── BackgroundLayer.ts
│   │   │       ├── FootprintLayer.ts # Heatmap coloring
│   │   │       ├── HeatmapLayer.ts
│   │   │       ├── IndicatorLayer.ts
│   │   │       └── OverlayLayer.ts
│   │   │
│   │   ├── types/              # TypeScript definitions
│   │   │   └── index.ts
│   │   │
│   │   └── utils/              # Helper functions
│   │       ├── calculations.ts
│   │       └── formatters.ts
│   │
│   └── index.html              # Entry point
│
├── cpp-engine/                 # Hyperion simulation engine
│   ├── include/
│   │   ├── order.hpp
│   │   ├── orderbook.hpp
│   │   ├── simulator.hpp
│   │   ├── telemetry.hpp
│   │   └── websocket.hpp
│   ├── src/
│   │   └── main.cpp
│   └── CMakeLists.txt
│
└── docs/
    └── ARCHITECTURE.md         # This file
```

---

## Performance Characteristics

| Metric          | Before Optimization | After Web Worker |
| --------------- | ------------------- | ---------------- |
| Max Throughput  | ~50 trades/sec      | 1000+ trades/sec |
| Frame Rate      | 5-10 fps            | 60 fps stable    |
| Latency         | 500ms+              | <16ms            |
| Memory (1hr)    | Growing unbounded   | Stable ~100MB    |
| Main Thread CPU | 80-100%             | <30%             |

### Key Optimizations

1. **Web Worker Offloading**: All JSON parsing and data processing moved off main thread
2. **10Hz Throttled Output**: Worker batches updates, sends at 100ms intervals
3. **Virtualized Lists**: TapeTable uses @tanstack/react-virtual for 1000+ row performance
4. **Canvas Rendering**: Charts bypass React DOM entirely
5. **Heatmap Coloring**: Volume intensity visualization with gradient colors
6. **Periodic Recalculation**: LiquidationHeatmap recalculates every 15 seconds
7. **Force Update Pattern**: Components using memo() properly re-render on data changes
8. **ResizeObserver**: Charts dynamically fill available space

---

## Simulation Engine (Hyperion)

The C++ engine provides synthetic market data for stress-testing and research.

### Trader Personas

```cpp
enum class TraderType {
    MarketMaker,    // Provides liquidity, tight spreads
    Retail,         // Small random orders
    Institutional,  // Large block trades
    Algo            // High-frequency patterns
};
```

### Statistics

```cpp
struct SimStats {
    uint64_t ordersProcessed;
    double ordersPerSecond;    // 700k+ achievable
    double matchRate;
    double avgSpread;
};
```

### Activation

1. Build engine:

   ```bash
   cd cpp-engine/build
   cmake --build . --config Release
   ```

2. Run engine:

   ```bash
   ./Release/hyperion.exe   # Windows
   ./hyperion               # Linux/Mac
   ```

   Starts WebSocket server on port 9001.

3. In TapeFlow UI, click "SIM" in the header to switch to simulation mode.

---

## Web Worker Architecture

The Web Worker (`data.worker.ts`) handles all CPU-intensive data processing off the main thread.

### Worker Responsibilities

```typescript
// data.worker.ts processes:
// 1. WebSocket connection management
// 2. JSON parsing (expensive at 500+ msg/sec)
// 3. Trade aggregation into 100ms time buckets
// 4. Candlestick OHLC calculation
// 5. Volume profile per candle
// 6. CVD (Cumulative Volume Delta) tracking
```

### Communication Protocol

```
Main Thread                           Web Worker
     │                                     │
     │──── { type: 'connect', wsUrl } ────▶│
     │                                     │ (opens WebSocket)
     │                                     │
     │◀─── { type: 'connected' } ──────────│
     │                                     │
     │                                     │ (processes messages)
     │                                     │ (aggregates at 100ms)
     │                                     │
     │◀─── { type: 'data', ... } ──────────│ (10Hz throttled output)
     │     trades: Trade[]                 │
     │     candles: Candle[]               │
     │     volumeProfile: Map              │
     │     cvd: number                     │
     │                                     │
     │──── { type: 'disconnect' } ─────────▶│
     │                                     │ (closes WebSocket)
```

### useDataWorker Hook

```typescript
const { isConnected, latestData, connect, disconnect } = useDataWorker();

// Connect to data source
connect("ws://localhost:3001");

// Receive pre-processed data at 10Hz
useEffect(() => {
  if (latestData) {
    // Data already aggregated, ready for rendering
    updateCharts(latestData.candles);
    updateTape(latestData.trades);
  }
}, [latestData]);
```

---

_This documentation is for TapeFlow v2.2. Last updated: February 2026._
