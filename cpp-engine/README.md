# Hyperion Engine

A small C++ matching engine and market simulator that TapeFlow can run against instead of a live exchange.

## Build Instructions

```bash
cd cpp-engine
mkdir build && cd build
cmake ..
cmake --build . --config Release
```

## Run

```bash
./hyperion      # Linux/Mac
hyperion.exe    # Windows
```

The engine runs three phases:

1. Order Book Test - Basic buy/sell matching validation
2. Benchmark - 5-second high-frequency test targeting 1M orders/sec
3. Telemetry Server - WebSocket server on ws://localhost:9001

## Benchmarks

The `hyperion` binary's phase 2 is **rate-limited** for a readable console feed
(~1M orders/sec), so it is not a throughput measurement. For raw matching-engine
throughput, run the standalone microbench, which drives `OrderBook` directly with
no simulator and no sleeps:

```bash
cmake --build build --target bench_orderbook
./build/bench_orderbook            # 10M ops per phase (default)
```

Measured on MinGW g++ 15.2 `-O3 -march=native` with nothing else running (other load
on the machine understates these by ~25%):

| Workload | Throughput |
| --- | --- |
| Mixed (rest/match/cancel) | ~2.3 M ops/s |
| Add-only (resting inserts) | ~4.2 M ops/s |

The order book is **mutex-guarded**, not lock-free.

## Architecture

- **Order Book**: Mutex-protected limit order book with O(1) best bid/ask
- **Market Simulator**: stochastic order flow from a handful of trader types
- **WebSocket Server**: Telemetry broadcast on port 9001

## Market Simulator

The simulator generates realistic market activity by modeling five distinct trader personas:

### Trader Types

| Type             | Distribution | Behavior                                                |
| ---------------- | ------------ | ------------------------------------------------------- |
| Market Maker     | 40%          | Provides liquidity with tight spreads, high cancel rate |
| Retail           | 20%          | Emotional trading, chases momentum, small order sizes   |
| Institutional    | 15%          | Patient and contrarian, larger orders, iceberg style    |
| Algo Momentum    | 15%          | Trend following, quick reactions                        |
| Algo Mean Revert | 10%          | Fades moves toward VWAP, contrarian                     |

### Price Dynamics

The simulator uses an Ornstein-Uhlenbeck process for realistic price evolution:

- **Mean Reversion**: Prices gravitate back toward a base price
- **Volatility**: Adaptive realized volatility calculation from recent history
- **Momentum**: Order flow imbalance creates short-term price trends
- **VWAP Tracking**: Volume-weighted average price for mean-revert strategies

### Order Flow Features

- **Order Cancellations**: Approximately 15% of orders are cancelled (realistic behavior)
- **Buy/Sell Pressure**: Tracks consecutive directional orders
- **Momentum Feedback**: Order flow imbalance influences price direction
- **Price Bounds**: Prices clamped to +/-10% from base to prevent unrealistic swings

### Statistics Tracked

- Orders generated per second (OPS)
- Total trades executed
- Orders cancelled
- Current/High/Low prices
- Realized volatility
