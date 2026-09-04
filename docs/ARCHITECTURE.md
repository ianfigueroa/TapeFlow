# TapeFlow Architecture

How the pieces fit together, where the data goes, and the formulas behind the numbers on screen.

## Overview

```
Binance Spot WS  (@trade, @depth20@100ms, @ticker)
Binance Futures WS (@forceOrder)
        |
        v
backend/   Node + Express + ws on :3001
        |  normalizes trades, book and liquidations, proxies a few Futures REST calls
        v
frontend/  React + Vite on :5173
        |
        +-- services/dataBuffer.ts   trades, book and ticker per symbol, outside React state
        +-- engine/                  canvas layers on one requestAnimationFrame loop
        +-- stores/                  Zustand (market, settings, paper trading)

Optional:
  Titan (ws://localhost:9001)      VWAP, spread, imbalance and whale alerts from C++
  Hyperion sim (ws://localhost:9001) synthetic market from cpp-engine/, used in SIM mode
```

Titan and the Hyperion simulator both default to port 9001, so run one or the other.

The main idea is that WebSocket data never goes through React state. Trades land in `dataBuffer.ts` (up to 5000 per symbol), components read from it, and the canvas layers redraw on the shared animation frame. At a few hundred trades per second, pushing every trade through `setState` made the UI stutter.

## Backend

`backend/adapters/binance.ts` opens two sockets: the Spot combined stream for trades, depth and ticker, and the Futures stream for liquidations (`@forceOrder`). Symbols are added and removed with SUBSCRIBE/UNSUBSCRIBE messages on the open sockets.

`server.ts` rebroadcasts normalized messages to browser clients and proxies `openInterest`, `longShortRatio` and `premiumIndex` from the Futures REST API so the browser does not hit CORS.

## Titan

The frontend connects to Titan directly through `services/titanService.ts` (`VITE_TITAN_WS_URL`, default `ws://localhost:9001`). When it is connected, Session Stats shows Titan's VWAP, spread and imbalance, and its whale alerts appear in the signals list with a TITAN tag. When it is not, that section says "Not connected" and everything else keeps using the in-browser calculations.

Reconnects back off exponentially from 1s (capped at 30s) and give up after 5 attempts.

Titan sends two message types:

```json
{
  "type": "metrics",
  "timestamp": "...",
  "book":  { "bestBid": 0, "bestBidQty": 0, "bestAsk": 0, "bestAskQty": 0, "spread": 0,
             "spreadBps": 0, "midPrice": 0, "imbalance": 0, "lastUpdateId": 0 },
  "trade": { "vwap": 0, "buyVolume": 0, "sellVolume": 0, "netFlow": 0, "tradeCount": 0 }
}
```

```json
{ "type": "alert", "timestamp": "...", "side": "BUY", "price": 0, "quantity": 0, "deviation": 2.3 }
```

`deviation` is how many standard deviations the trade size is above the recent mean.

## Alerts

`utils/AlertManager.ts` makes the sounds with the Web Audio API, so there are no audio files:

| Alert | Frequency | Duration | Waveform |
| --- | --- | --- | --- |
| Whale | 600 Hz | 300 ms | sine |
| Break | 1200 Hz | 150 ms | square |
| Velocity | 900 Hz | 200 ms | sine |
| Wall | 400 Hz | 400 ms | triangle |
| Spoof | 1500 Hz | 100 ms | sawtooth |

Alerts have a configurable cooldown (`alertCooldownSeconds` in settings) so a burst of trades does not play the same sound fifty times.

## Paper trading

`paper/PaperTradingEngine.ts` fills orders against the live price with slippage and fees, and runs risk checks before accepting an order. Defaults from `paper/types.ts`:

| Setting | Default |
| --- | --- |
| Slippage | 2 bps |
| Fee | 8 bps |
| Max position size | $100,000 |
| Max single order | $50,000 |
| Max open positions | 5 |
| Daily loss limit | $5,000 |

## Layout

The dockable layout is flexlayout-react. The model is saved to `localStorage` under `tapeflow-workspace-layout`. `CURRENT_LAYOUT_VERSION` in `TapeFlowWorkspace.tsx` gets bumped when a panel is added, and a saved layout with an older version is replaced by the new default.

## Formulas

**VWAP**

```
VWAP = sum(price * volume) / sum(volume)
```

**CVD** (cumulative volume delta): running sum of buy volume minus sell volume, where the side is the aggressor.

**OPS** (trades per second): `dataBuffer.ts` keeps trade timestamps for 10 seconds and counts the ones in the last 1000 ms.

**Book imbalance**

```
imbalance = (bid volume - ask volume) / (bid volume + ask volume)
```

It ranges from -1 (all asks) to +1 (all bids). The frontend shows it as a percentage.

**Liquidation zones**: the liquidation heatmap is an estimate, not exchange data. It takes common leverage levels (5x to 100x), computes where a long or short opened near the current price would be liquidated (`entry * (1 -/+ 1/leverage)`), and weights each zone by open interest and the long/short ratio. It polls every 10 seconds.

## Hyperion simulator

`cpp-engine/` is a price-time priority matching engine plus a simulator that drives it with an Ornstein-Uhlenbeck price process and five trader types (market maker, retail, institutional, momentum algo, mean-reversion algo). It streams book telemetry over a hand-written RFC 6455 WebSocket server on port 9001, and the SIM toggle in the header switches the frontend to it.

The built-in benchmark is paced at about 1M orders/sec. `bench_orderbook` measures the order book on its own: roughly 2.1 to 2.3M mixed ops/sec and 4.3M add-only inserts/sec on my machine. See the main README for the setup.
