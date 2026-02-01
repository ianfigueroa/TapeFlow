// In-app documentation and help panel

import { useState } from 'react';
import { cn } from '../lib/utils';

interface HelpPanelProps {
  onClose: () => void;
}

type HelpSection = 'overview' | 'tape' | 'orderbook' | 'indicators' | 'signals' | 'analysis' | 'trading' | 'shortcuts';

const sections: { id: HelpSection; title: string }[] = [
  { id: 'overview', title: 'Quick Start' },
  { id: 'tape', title: 'Reading the Tape' },
  { id: 'orderbook', title: 'Order Book' },
  { id: 'indicators', title: 'Indicators' },
  { id: 'signals', title: 'Signals' },
  { id: 'analysis', title: 'Analysis Dashboard' },
  { id: 'trading', title: 'Paper Trading' },
  { id: 'shortcuts', title: 'Tips & Shortcuts' },
];

export function HelpPanel({ onClose }: HelpPanelProps) {
  const [activeSection, setActiveSection] = useState<HelpSection>('overview');

  return (
    <div className="bg-black border border-gray-800 rounded-lg w-[800px] max-h-[80vh] overflow-hidden font-mono text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-[#00FF41] text-lg">TapeFlow Documentation</h2>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex h-[60vh]">
        {/* Sidebar */}
        <div className="w-48 border-r border-gray-800 p-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded text-xs',
                activeSection === section.id
                  ? 'bg-[#00FF41]/10 text-[#00FF41]'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900'
              )}
            >
              {section.title}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'overview' && <OverviewSection />}
          {activeSection === 'tape' && <TapeSection />}
          {activeSection === 'orderbook' && <OrderBookSection />}
          {activeSection === 'indicators' && <IndicatorsSection />}
          {activeSection === 'signals' && <SignalsSection />}
          {activeSection === 'analysis' && <AnalysisSection />}
          {activeSection === 'trading' && <TradingSection />}
          {activeSection === 'shortcuts' && <ShortcutsSection />}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[#00FF41] text-base mb-3 font-bold">{children}</h3>;
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-white text-sm mb-2 mt-4">{children}</h4>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-400 text-xs leading-relaxed mb-3">{children}</p>;
}

function ColorLabel({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 mr-3">
      <span className={cn('w-3 h-3 rounded', color)} />
      <span className="text-gray-300">{label}</span>
    </span>
  );
}

function OverviewSection() {
  return (
    <>
      <SectionTitle>Quick Start Guide</SectionTitle>
      <Paragraph>
        TapeFlow is a real-time market analysis tool that displays the "tape" -
        a live stream of executed trades - along with Level 2 order book depth
        and quantitative indicators commonly used by professional traders.
      </Paragraph>

      <SubTitle>Getting Started</SubTitle>
      <ol className="list-decimal list-inside text-gray-400 text-xs space-y-2 mb-4">
        <li>Click <span className="text-[#00FF41]">+ ADD</span> to add a symbol (e.g., BTCUSDT)</li>
        <li>Watch the tape stream in real-time on the left panel</li>
        <li>View the order book depth on the right sidebar</li>
        <li>Monitor signals and analysis for market context</li>
        <li>Use paper trading to practice without risk</li>
      </ol>

      <SubTitle>Key Features</SubTitle>
      <ul className="text-gray-400 text-xs space-y-1.5">
        <li className="flex items-start gap-2">
          <span className="text-[#00FF41]">-</span>
          <span><strong className="text-white">Real-time Tape:</strong> Every trade as it happens</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-[#00FF41]">-</span>
          <span><strong className="text-white">Order Book:</strong> Level 2 bid/ask depth with imbalance</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-[#00FF41]">-</span>
          <span><strong className="text-white">VWAP:</strong> Volume-weighted average price tracking</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-[#00FF41]">-</span>
          <span><strong className="text-white">CVD:</strong> Cumulative volume delta for order flow</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-[#00FF41]">-</span>
          <span><strong className="text-white">Signals:</strong> Automated detection of notable events</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-[#00FF41]">-</span>
          <span><strong className="text-white">Paper Trading:</strong> Practice trading with virtual money</span>
        </li>
      </ul>
    </>
  );
}

function TapeSection() {
  return (
    <>
      <SectionTitle>Reading the Tape</SectionTitle>
      <Paragraph>
        The tape shows every executed trade in real-time. Each row represents
        one trade with the following information:
      </Paragraph>

      <SubTitle>Columns</SubTitle>
      <ul className="text-gray-400 text-xs space-y-2 mb-4">
        <li><strong className="text-white">TIME:</strong> When the trade executed (HH:MM:SS.mmm)</li>
        <li><strong className="text-white">PRICE:</strong> Execution price</li>
        <li><strong className="text-white">SIZE:</strong> Trade volume/quantity</li>
        <li><strong className="text-white">VALUE:</strong> Dollar value (price x size)</li>
        <li><strong className="text-white">SIDE:</strong> Buy (bid lifted) or Sell (ask hit)</li>
      </ul>

      <SubTitle>Color Coding</SubTitle>
      <div className="flex flex-wrap gap-2 mb-4">
        <ColorLabel color="bg-[#00FF41]" label="Buy (lifting the ask)" />
        <ColorLabel color="bg-[#FF4545]" label="Sell (hitting the bid)" />
      </div>

      <SubTitle>Trade Size Highlighting</SubTitle>
      <Paragraph>
        Large trades ("whale" trades) are highlighted with brighter colors and
        may flash briefly to catch your attention. The threshold for what
        constitutes a "large" trade adapts to the current market conditions.
      </Paragraph>

      <SubTitle>Side Detection</SubTitle>
      <Paragraph>
        The side (buy/sell) is determined by comparing the trade price to the
        order book. If the trade executed at or above the best ask, it's marked
        as a buy (an aggressive buyer "lifted" the ask). If it executed at or
        below the best bid, it's a sell (an aggressive seller "hit" the bid).
      </Paragraph>
    </>
  );
}

function OrderBookSection() {
  return (
    <>
      <SectionTitle>Order Book (Level 2)</SectionTitle>
      <Paragraph>
        The order book shows resting limit orders waiting to be filled.
        The left side shows bids (buy orders) and the right shows asks (sell orders).
      </Paragraph>

      <SubTitle>Reading the Book</SubTitle>
      <ul className="text-gray-400 text-xs space-y-2 mb-4">
        <li><strong className="text-white">BID:</strong> Price buyers are willing to pay (green)</li>
        <li><strong className="text-white">ASK:</strong> Price sellers are asking (red)</li>
        <li><strong className="text-white">SIZE:</strong> Quantity at each price level</li>
        <li><strong className="text-white">SPREAD:</strong> Difference between best bid and best ask</li>
        <li><strong className="text-white">MID:</strong> Midpoint price between bid and ask</li>
      </ul>

      <SubTitle>Imbalance (IMB)</SubTitle>
      <Paragraph>
        The imbalance indicator shows the ratio of bid volume to ask volume in
        the visible book. A positive percentage means more bid support; negative
        means more ask pressure. Use this to gauge short-term supply/demand.
      </Paragraph>

      <SubTitle>Heatmap</SubTitle>
      <Paragraph>
        The colored bars behind each price level represent relative size.
        Longer/brighter bars indicate larger orders. This helps you quickly
        spot "walls" - large orders that may act as support/resistance.
      </Paragraph>

      <SubTitle>Update Rate</SubTitle>
      <Paragraph>
        The order book updates at 60fps to match the tape. The "X/sec" counter
        shows how many updates are being received from the exchange.
      </Paragraph>
    </>
  );
}

function IndicatorsSection() {
  return (
    <>
      <SectionTitle>Indicators & Metrics</SectionTitle>

      <SubTitle>VWAP (Volume-Weighted Average Price)</SubTitle>
      <Paragraph>
        VWAP is the average price weighted by volume. It represents the "fair value"
        based on actual trading activity. Institutions often use VWAP as a benchmark -
        buying below VWAP and selling above it is considered favorable execution.
      </Paragraph>
      <ul className="text-gray-400 text-xs space-y-1 mb-4">
        <li><span className="text-[#00FF41]">Price above VWAP</span> - Trading above fair value (bullish)</li>
        <li><span className="text-[#FF4545]">Price below VWAP</span> - Trading below fair value (bearish)</li>
      </ul>

      <SubTitle>CVD (Cumulative Volume Delta)</SubTitle>
      <Paragraph>
        CVD tracks the cumulative difference between buy and sell volume.
        Rising CVD indicates net buying pressure (accumulation).
        Falling CVD indicates net selling pressure (distribution).
      </Paragraph>

      <SubTitle>OBI (Order Book Imbalance)</SubTitle>
      <Paragraph>
        OBI measures the ratio of bid volume to ask volume in the order book.
        A strongly positive OBI suggests buyers are more aggressive;
        negative suggests sellers are in control.
      </Paragraph>

      <SubTitle>OPS (Operations Per Second)</SubTitle>
      <Paragraph>
        OPS shows the current trade rate - how many trades are occurring
        per second. High OPS indicates active trading; low OPS suggests
        a quiet market.
      </Paragraph>

      <SubTitle>Momentum</SubTitle>
      <Paragraph>
        Momentum tracks the recent price direction using a short rolling window.
        Positive momentum means prices have been rising; negative means falling.
      </Paragraph>
    </>
  );
}

function SignalsSection() {
  return (
    <>
      <SectionTitle>Signals</SectionTitle>
      <Paragraph>
        TapeFlow automatically detects notable market events and displays them
        as signals. These are not predictions - they highlight activity that
        may warrant attention.
      </Paragraph>

      <SubTitle>Signal Types</SubTitle>
      <ul className="text-gray-400 text-xs space-y-3">
        <li>
          <strong className="text-white">Whale Trade:</strong> Large single trade
          significantly above average size. May indicate institutional activity
          or a large player entering/exiting.
        </li>
        <li>
          <strong className="text-white">Velocity Spike:</strong> Sudden increase
          in trade rate (OPS). Often accompanies news events or technical breakouts.
        </li>
        <li>
          <strong className="text-white">Book Imbalance:</strong> Extreme imbalance
          in the order book. Large imbalance may precede price movement in that direction.
        </li>
        <li>
          <strong className="text-white">VWAP Cross:</strong> Price crossing above
          or below VWAP. Some traders consider this significant for short-term direction.
        </li>
        <li>
          <strong className="text-white">Large Wall:</strong> Unusually large order
          appearing in the book. May act as support/resistance but can also be "spoofing".
        </li>
      </ul>

      <SubTitle>Important Note</SubTitle>
      <Paragraph>
        Signals are informational only. They highlight events but do not predict
        future price movement. Always do your own analysis and never trade solely
        based on signals.
      </Paragraph>
    </>
  );
}

function AnalysisSection() {
  return (
    <>
      <SectionTitle>Analysis Dashboard</SectionTitle>
      <Paragraph>
        The Analysis Dashboard provides a quantitative summary of current market
        conditions. It aggregates multiple indicators into a single view to help
        you quickly assess the market context.
      </Paragraph>

      <SubTitle>Market Context</SubTitle>
      <Paragraph>
        The overall sentiment (Bullish/Bearish/Neutral) is determined by counting
        how many individual indicators are positive vs negative. This is a simple
        majority vote - not a sophisticated prediction model.
      </Paragraph>

      <SubTitle>Individual Metrics</SubTitle>
      <ul className="text-gray-400 text-xs space-y-2 mb-4">
        <li><strong className="text-white">Price vs VWAP:</strong> Is price above or below fair value?</li>
        <li><strong className="text-white">Book Imbalance:</strong> Are buyers or sellers dominant in the order book?</li>
        <li><strong className="text-white">CVD:</strong> Is volume flowing into buys or sells?</li>
        <li><strong className="text-white">Momentum:</strong> What is the recent price trend?</li>
        <li><strong className="text-white">Buy Ratio:</strong> What percentage of recent volume was buying?</li>
        <li><strong className="text-white">Spread:</strong> Is the market tight (stable) or wide (volatile)?</li>
      </ul>

      <SubTitle>Disclaimer</SubTitle>
      <Paragraph>
        This is analysis of current conditions, not a prediction. Markets are
        inherently unpredictable. The "Bullish" or "Bearish" label describes
        current order flow patterns, not future price direction. Use this as
        one data point among many in your research.
      </Paragraph>
    </>
  );
}

function TradingSection() {
  return (
    <>
      <SectionTitle>Paper Trading</SectionTitle>
      <Paragraph>
        Paper trading lets you practice trading strategies without risking real money.
        Your virtual orders are filled based on live market data, giving you a
        realistic simulation experience.
      </Paragraph>

      <SubTitle>Getting Started</SubTitle>
      <ol className="list-decimal list-inside text-gray-400 text-xs space-y-2 mb-4">
        <li>Open the Paper Trading section in the sidebar</li>
        <li>You start with $100,000 virtual balance</li>
        <li>Select Buy or Sell</li>
        <li>Choose Market or Limit order type</li>
        <li>Enter quantity and submit</li>
      </ol>

      <SubTitle>Order Types</SubTitle>
      <ul className="text-gray-400 text-xs space-y-2 mb-4">
        <li><strong className="text-white">Market:</strong> Executes immediately at current price</li>
        <li><strong className="text-white">Limit:</strong> Executes only when price reaches your level</li>
      </ul>

      <SubTitle>Position Management</SubTitle>
      <ul className="text-gray-400 text-xs space-y-1">
        <li>Your open position shows entry price and unrealized P&L</li>
        <li>Click "FLATTEN" to close your entire position at market</li>
        <li>Click "Reset Account" to start fresh with $100,000</li>
      </ul>

      <SubTitle>P&L Tracking</SubTitle>
      <Paragraph>
        The status bar at the bottom shows your total P&L (realized + unrealized)
        and current equity. Win rate is calculated from your closed trades.
      </Paragraph>
    </>
  );
}

function ShortcutsSection() {
  return (
    <>
      <SectionTitle>Tips & Shortcuts</SectionTitle>

      <SubTitle>Interface Tips</SubTitle>
      <ul className="text-gray-400 text-xs space-y-2 mb-4">
        <li><strong className="text-white">Tab Management:</strong> Click a tab to select, X to close, or right-click for options</li>
        <li><strong className="text-white">Popout:</strong> Click the popout icon on a tab to open in a new window</li>
        <li><strong className="text-white">Combined Tape:</strong> Click "COMBINED" to merge all symbol tapes into one view</li>
        <li><strong className="text-white">Pause Scroll:</strong> Click "SCROLL/PAUSED" to freeze the tape for analysis</li>
        <li><strong className="text-white">Export:</strong> Click "EXPORT" to download tape data as CSV</li>
        <li><strong className="text-white">Collapsible Sections:</strong> Click section headers to expand/collapse</li>
      </ul>

      <SubTitle>Recording Sessions</SubTitle>
      <Paragraph>
        Use the Record & Replay feature to capture market data for later analysis:
      </Paragraph>
      <ol className="list-decimal list-inside text-gray-400 text-xs space-y-1 mb-4">
        <li>Click "REC" to start recording</li>
        <li>Watch the trade counter increase</li>
        <li>Click "STOP REC" when done</li>
        <li>Select your session from the dropdown to replay</li>
        <li>Use playback controls to step through at various speeds</li>
      </ol>

      <SubTitle>Reading Order Flow</SubTitle>
      <Paragraph>
        Experienced tape readers look for patterns like:
      </Paragraph>
      <ul className="text-gray-400 text-xs space-y-1">
        <li>- Large trades at key price levels</li>
        <li>- Clusters of aggressive buying/selling</li>
        <li>- Absorption (large orders getting filled without price moving)</li>
        <li>- Exhaustion (slowing velocity after a move)</li>
        <li>- Iceberg orders (consistent size repeating at same price)</li>
      </ul>

      <SubTitle>Performance</SubTitle>
      <Paragraph>
        TapeFlow is designed for high-frequency data. If you experience lag, try
        closing unused tabs or reducing the number of price levels shown in the
        order book via Settings.
      </Paragraph>
    </>
  );
}
