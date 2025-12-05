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

## Architecture

- **Order Book**: Lock-free limit order book with O(1) best bid/ask
- **Market Simulator**: Stochastic load generator (target: 1M orders/sec)
- **WebSocket Server**: Telemetry broadcast on port 9001
