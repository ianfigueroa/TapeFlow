# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TapeFlow is a production-grade real-time cryptocurrency trading terminal optimized for high-frequency order flow analysis (500+ trades/second). It uses a decoupled architecture that separates WebSocket data ingestion from React UI rendering to maintain 60fps performance.

## Commands

### Frontend (in `frontend/` directory)
```bash
npm run dev       # Start Vite dev server (port 5173)
npm run build     # TypeScript compile + production build
npm run lint      # ESLint with max-warnings=0
npm run preview   # Preview production build
```

### Backend (in `backend/` directory)
```bash
npm run dev       # tsx watch mode (auto-reload on port 3001)
npm run build     # Compile TypeScript to dist/
npm run start     # Run compiled server
npm run lint      # ESLint
```

### Full Stack Development
```bash
# Terminal 1
cd backend && npm install && npm run dev

# Terminal 2
cd frontend && npm install && npm run dev

# Browser: http://localhost:5173
```

### Type Checking
```bash
cd frontend && npx tsc --noEmit   # Check types without emitting
```

## Architecture

### Core Design Principle: Mutable Buffers Over React State

At 500+ trades/second, React's reconciliation saturates the render queue. The solution:
- Store high-frequency data in plain JavaScript structures outside React
- UI components poll buffers at 60fps for batched updates
- Result: 500 messages/sec in → 60 renders/sec out

### Data Flow
```
Binance WebSocket → Node.js Proxy (3001) → Frontend WebSocket
    ↓
Mutable Buffers (dataBuffer.ts)
    ├── Trade Buffer (circular, 1000 max)
    ├── OrderBook Buffer (latest snapshot)
    └── Rate Tracker (sliding window OPS)
    ↓
Analytics Engine (React-independent)
    ├── OPSCalculator, CVDCalculator, VWAPCalculator
    └── OBICalculator, SpreadAnalyzer
    ↓
React Components (60fps polling intervals)
```

### Key Directories

- **`frontend/src/services/dataBuffer.ts`** - Central buffer layer, trade rate tracking, `subscribeToTrades()` listener pattern
- **`frontend/src/stores/`** - Zustand stores (useMarketStore, useSettingsStore, usePaperTradingStore, useRecordingStore)
- **`frontend/src/analytics/`** - Calculators and detectors (stateless, no React dependencies)
- **`frontend/src/engine/`** - Canvas rendering system with LayerManager (60fps RAF loop)
- **`frontend/src/components/DashboardLayout.tsx`** - Main app shell with collapsible sidebar sections
- **`backend/adapters/`** - Exchange adapters (BinanceAdapter extends BaseAdapter)

### Canvas Layer System

Single `requestAnimationFrame` loop manages z-indexed layers:
```
LayerManager (61fps)
    BackgroundLayer (z:0)   - Grid, axis
    HeatmapLayer (z:10)     - Order book depth (log10 scaling)
    FootprintLayer (z:20)   - Cluster charts, POC highlight
    IndicatorLayer (z:30)   - VWAP, liquidity zones
    OverlayLayer (z:40)     - Crosshair, tooltips
```

### State Management

Zustand stores handle different concerns:
- **useMarketStore** - WebSocket connection, symbol data, trade buffers
- **useSettingsStore** - Theme colors, visualization toggles
- **usePaperTradingStore** - Order matching, positions, P&L (subscribes to trade stream)
- **useRecordingStore** - Session recording/replay (subscribes to trade stream)

## Key Patterns

### Trade Listener Pattern
Components that need live trade data subscribe via `subscribeToTrades()` from dataBuffer.ts:
```typescript
const unsubscribe = subscribeToTrades((trade) => {
  // Process trade
});
return () => unsubscribe();
```

### Polling Pattern for UI Updates
High-frequency components use intervals instead of state updates:
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    const { trades, hasNewData } = flushTradeBuffer(symbol);
    if (hasNewData) setDisplayTrades(trades);
  }, 16); // 60fps
  return () => clearInterval(interval);
}, [symbol]);
```

### Symbol Change Cleanup
When symbol changes, clear stale data:
```typescript
useEffect(() => {
  setDisplayData(null);
  resetBuffers();
}, [symbol]);
```

## Type Definitions

Key types are in `frontend/src/types/index.ts`:
- **Trade** - id, symbol, price, volume, side, timestamp
- **TradeWithAnalytics** - extends Trade with vwap, delta, momentum, etc.
- **OrderBook** - bids/asks arrays of OrderBookLevel
- **SymbolState** - complete state for a single symbol

## Performance Targets

| Metric | Target |
|--------|--------|
| Trade throughput | 500+/sec |
| Render rate | 60fps |
| Input latency | <16ms |
| Memory (heap) | <100MB |


## Global Rules & Workflow

> **System Context:** You must adhere to the global rules located in `~/.claude/rules/`. These take precedence over general training.

-   **Style & Quality:** Read and follow `~/.claude/rules/coding-style.md`
-   **Security:** Read and follow `~/.claude/rules/security.md`
-   **Git Process:** Read and follow `~/.claude/rules/git-workflow.md`
-   **Performance:** Read and follow `~/.claude/rules/performance.md`

> **Workflow:** For all new feature implementation, do not write code immediately.
> 1. Run `/plan` to outline the changes.
> 2. Invoke the TDD agent by running `/tdd` or referencing the **`tdd-guide`** agent.

