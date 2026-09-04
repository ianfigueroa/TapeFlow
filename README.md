# TapeFlow

![TapeFlow v2](./docs/tapeflow_v2.png)

A trading terminal for reading order flow on crypto markets. It shows the tape, footprint charts, a DOM ladder, CVD, volume profile, open interest and liquidations, flags whale trades and spoofing, and lets you paper trade against live prices. It can run against live Binance data or against a local C++ matching engine that simulates a market, and the UI does not care which one it is talking to.

I built it because the tools I wanted to learn tape reading on were either paid or ran on a single symbol. This runs in a browser on anything.

## What is in it

- Time and Sales tape with whale trade highlighting
- Footprint charts with a volume heatmap
- DOM ladder with bid/ask imbalance detection
- Cumulative volume delta overlay
- Volume profile with point of control
- Open interest and liquidation views
- Signal detection for whale trades, velocity surges, spoofing and walls
- Sound and desktop alerts with cooldowns
- Paper trading with slippage, fees, stop loss, take profit, position and daily loss limits
- Session stats (VWAP, high/low, delta)
- Dockable layout you can rearrange and save
- A few color themes

## How it is put together

```
Binance WebSocket
    |
    v
backend/  Node proxy on :3001
    |     normalizes trades, aggregates the book, tracks OI and liquidations
    v
frontend/ React on :5173
    |
    +-- services/dataBuffer.ts   ring buffer, last 5000 trades per symbol, subscriber callbacks
    +-- components/              TapeTable, FootprintChart, DOMLadder, CVDOverlay, VolumeProfile,
    |                            OIMonitor, LiquidationHeatmap, AlgoSignals, ExecutionPanel, SessionStats
    +-- paper/                   PaperTradingEngine + risk checks
    +-- engine/                  canvas layers driven by one requestAnimationFrame loop
    +-- analytics/               OPS, CVD, spread, OBI, iceberg and liquidity-zone calculators
```

Trades go into a mutable ring buffer and components subscribe to it directly. At a few hundred trades per second, pushing every trade through React state made the UI stutter, so the hot path skips React entirely and only the canvas layers redraw.

Everything in `analytics/` is plain TypeScript with no React imports, so the calculators are easy to test on their own.

### Signals

| Signal | How it is detected | Default threshold |
| --- | --- | --- |
| Whale trade | single trade notional | > $50K (> $250K on BTC) |
| Velocity surge | trades/sec vs the 30s average | > 300% |
| Wall | large resting size at one level | > $100K |
| Spoof | large order pulled before it fills | > $50K removed |
| Imbalance | bid/ask size ratio at a level | > 3:1 |

### Paper trading

Market and limit orders, long/short positions, average entry, realized and unrealized P&L. Fills are simulated against the real L1 with configurable slippage and fees. Risk checks reject orders that would break the max order size, max position size, max open positions or daily loss limit, and positions can carry a stop loss and take profit.

## Running it

You need Node 18+.

```bash
git clone https://github.com/ianfigueroa/TapeFlow.git
cd TapeFlow

cd backend && npm install && npm run dev      # terminal 1
cd frontend && npm install && npm run dev     # terminal 2
```

Open http://localhost:5173.

`npm run build` in either folder produces a production build. `docker-compose up -d` runs the backend, an nginx-served frontend and Titan together.

### Titan

The backend can pull VWAP, book imbalance and whale alerts from [Titan](https://github.com/ianfigueroa/Titan), a C++ market data engine, instead of computing them in JavaScript. Set `TITAN_WS_URL=ws://titan:9001` (or run `docker pull ghcr.io/ianfigueroa/titan:latest`). The header shows "Titan Connected" when it is up; if it is not, TapeFlow falls back to its own calculators.

### Backend proxy routes

The backend proxies a few Binance Futures REST calls so the browser does not hit CORS:

- `/api/binance/openInterest`
- `/api/binance/longShortRatio`
- `/api/binance/premiumIndex`

## Keyboard

| Key | Action |
| --- | --- |
| Space | pause/resume the tape |
| S | focus symbol search |
| A | toggle alerts panel |
| ? | shortcut list |
| R | clear trades |
| 1-9 | switch symbol tab |
| Ctrl+W | close tab |

## The C++ engine (cpp-engine/)

`cpp-engine/` is a small matching engine plus a market simulator that TapeFlow can use instead of a live feed. The order book is price-time priority and is guarded by a mutex (it is not lock-free). The simulator drives it with an Ornstein-Uhlenbeck price process and a mix of trader types, and there is a header-only RFC 6455 WebSocket server (hand-written SHA-1 and Base64 for the handshake, no dependencies) that streams book telemetry to the frontend.

```bash
cd cpp-engine
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
./build/hyperion            # demo, then the built-in 1M orders/sec simulator benchmark, then the telemetry server
```

The built-in benchmark is paced by the simulator and tops out around 1M orders/sec by design. To measure the order book itself:

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DHYPERION_BUILD_BENCHMARKS=ON
cmake --build build --target bench_orderbook
./build/bench_orderbook
```

On a Ryzen 9 8945HS with MinGW g++ 15 `-O3 -march=native`, run with nothing else on the machine, that gives roughly 2.1 to 2.3M mixed add/cancel/match ops per second and about 4.3M add-only inserts per second. Numbers move with the CPU and with whatever else is running; treat them as a ballpark, not a spec.

See `cpp-engine/README.md` for the simulator parameters.

## Stack

React 18, TypeScript, Vite, Zustand, Tailwind, flexlayout-react, @tanstack/react-virtual, TradingView lightweight-charts, Node + Express + ws, C++20 for the engine.

## License

MIT
