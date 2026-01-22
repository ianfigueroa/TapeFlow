# Hyperion Engine

High-performance C++ simulation engine for TapeFlow.

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

## Architecture

- **Order Book**: Lock-free limit order book with O(1) best bid/ask
- **Market Simulator**: Human-like stochastic load generator with trader personas
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
