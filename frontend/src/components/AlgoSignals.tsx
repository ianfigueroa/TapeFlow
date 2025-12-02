// Trading signal detection: whale trades, velocity surges, walls, spoofs

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { cn } from '../lib/utils';
import { subscribeToTrades, getCurrentOrderBook, getTradeRate, resetTradeRateTracker } from '../services/dataBuffer';
import { formatPrice } from '../utils/formatters';
import type { Trade } from '../types';

type SignalType = 'whale' | 'velocity' | 'spoof' | 'wall' | 'imbalance';

interface AlgoSignal {
  id: string;
  type: SignalType;
  symbol: string;
  message: string;
  value: number;
  side?: 'buy' | 'sell';
  timestamp: number;
  price?: number;
}

interface AlgoSignalsProps {
  symbol: string;
  velocitySpike?: number;
  maxSignals?: number;
  className?: string;
}

function formatDollarCompact(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function formatTimeShort(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { 
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

export const AlgoSignals = memo(function AlgoSignals({
  symbol,
  velocitySpike = 300,
  maxSignals = 50,
  className,
}: AlgoSignalsProps) {
  const [signals, setSignals] = useState<AlgoSignal[]>([]);
  const [tradesPerSec, setTradesPerSec] = useState(0);
  const [avgTradesPerSec, setAvgTradesPerSec] = useState(0);
  const [currentVelocityPct, setCurrentVelocityPct] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  
  const currentSymbolRef = useRef<string>(symbol);
  const currentPriceRef = useRef<number>(0);
  const signalIdCounterRef = useRef(0);
  
  // Dynamic thresholds: BTC uses higher values
  const getThresholds = useCallback(() => {
    const isBTC = currentPriceRef.current >= 50000;
    return {
      whaleMin: isBTC ? 250000 : 50000,
      spoofMin: isBTC ? 300000 : 50000,
    };
  }, []);
  
  // Reset on symbol change
  useEffect(() => {
    if (currentSymbolRef.current !== symbol) {
      setSignals([]);
      setTradesPerSec(0);
      setAvgTradesPerSec(0);
      setCurrentVelocityPct(0);
      currentSymbolRef.current = symbol;
      currentPriceRef.current = 0;
      resetTradeRateTracker(symbol);
    }
  }, [symbol]);
  
  const generateSignalId = useCallback(() => {
    signalIdCounterRef.current++;
    return `signal-${Date.now()}-${signalIdCounterRef.current}`;
  }, []);
  
  const addSignal = useCallback((signal: Omit<AlgoSignal, 'id' | 'timestamp'>) => {
    setSignals(prev => [{ ...signal, id: generateSignalId(), timestamp: Date.now() }, ...prev].slice(0, maxSignals));
  }, [generateSignalId, maxSignals]);
  
  // Whale detection via trade subscription
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      currentPriceRef.current = trade.price;
      
      const tradeValue = trade.price * trade.volume;
      const { whaleMin } = getThresholds();
      
      if (tradeValue >= whaleMin) {
        const sideText = trade.side === 'buy' ? 'BUY' : trade.side === 'sell' ? 'SELL' : '';
        addSignal({
          type: 'whale',
          symbol: trade.symbol,
          message: `${sideText} ${formatDollarCompact(tradeValue)} @ ${formatPrice(trade.price, 'crypto')}`,
          value: tradeValue,
          side: trade.side === 'buy' ? 'buy' : trade.side === 'sell' ? 'sell' : undefined,
          price: trade.price,
        });
      }
    });
    return () => unsubscribe();
  }, [symbol, addSignal, getThresholds]);
  
  // Velocity detection (1s interval)
  useEffect(() => {
    const interval = setInterval(() => {
      const rateStats = getTradeRate(symbol);
      setTradesPerSec(rateStats.current);
      setAvgTradesPerSec(rateStats.avg);
      
      if (rateStats.history.length >= 3 && rateStats.avg > 0) {
        const velocityPct = ((rateStats.current - rateStats.avg) / rateStats.avg) * 100;
        setCurrentVelocityPct(Math.round(velocityPct));
        
        if (rateStats.avg > 5 && rateStats.current > rateStats.avg * (1 + velocitySpike / 100)) {
          addSignal({
            type: 'velocity',
            symbol,
            message: `SURGE ${rateStats.current}/sec (+${Math.round(velocityPct)}% vs avg ${rateStats.avg.toFixed(0)})`,
            value: rateStats.current,
          });
        }
      } else {
        setCurrentVelocityPct(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [symbol, velocitySpike, addSignal]);
  
  // Wall and spoof detection (500ms interval on order book)
  const prevOrderBookRef = useRef<{
    bids: Map<number, { size: number; timestamp: number }>;
    asks: Map<number, { size: number; timestamp: number }>;
    avgBidSize: number;
    avgAskSize: number;
  } | null>(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const orderBook = getCurrentOrderBook(symbol);
      if (!orderBook || orderBook.bids.length === 0 || orderBook.asks.length === 0) return;
      
      const now = Date.now();
      const avgBidSize = orderBook.bids.reduce((sum, l) => sum + l.size, 0) / orderBook.bids.length;
      const avgAskSize = orderBook.asks.reduce((sum, l) => sum + l.size, 0) / orderBook.asks.length;
      
      const WALL_MULTIPLIER = 5;
      const WALL_MIN_USD = 150000;
      
      const currentBids = new Map<number, { size: number; timestamp: number }>();
      const currentAsks = new Map<number, { size: number; timestamp: number }>();
      
      orderBook.bids.forEach(level => currentBids.set(level.price, { size: level.size, timestamp: now }));
      orderBook.asks.forEach(level => currentAsks.set(level.price, { size: level.size, timestamp: now }));
      
      // Wall detection
      orderBook.bids.forEach(level => {
        const wallValue = level.size * level.price;
        if (level.size > avgBidSize * WALL_MULTIPLIER && wallValue >= WALL_MIN_USD) {
          const prev = prevOrderBookRef.current?.bids.get(level.price);
          if (!prev || prev.size < avgBidSize * WALL_MULTIPLIER) {
            addSignal({
              type: 'wall', symbol,
              message: `BID WALL ${formatDollarCompact(wallValue)} @ ${formatPrice(level.price, 'crypto')} (${(level.size / avgBidSize).toFixed(1)}x avg)`,
              value: wallValue, side: 'buy', price: level.price,
            });
          }
        }
      });
      
      orderBook.asks.forEach(level => {
        const wallValue = level.size * level.price;
        if (level.size > avgAskSize * WALL_MULTIPLIER && wallValue >= WALL_MIN_USD) {
          const prev = prevOrderBookRef.current?.asks.get(level.price);
          if (!prev || prev.size < avgAskSize * WALL_MULTIPLIER) {
            addSignal({
              type: 'wall', symbol,
              message: `ASK WALL ${formatDollarCompact(wallValue)} @ ${formatPrice(level.price, 'crypto')} (${(level.size / avgAskSize).toFixed(1)}x avg)`,
              value: wallValue, side: 'sell', price: level.price,
            });
          }
        }
      });
      
      // Spoof detection
      if (prevOrderBookRef.current) {
        const { spoofMin } = getThresholds();
        
        prevOrderBookRef.current.bids.forEach((prevLevel, price) => {
          const currentLevel = currentBids.get(price);
          const spoofValue = prevLevel.size * price;
          if (prevLevel.size > avgBidSize * 3 && spoofValue >= spoofMin &&
              (!currentLevel || currentLevel.size < prevLevel.size * 0.3) &&
              now - prevLevel.timestamp < 2000) {
            addSignal({
              type: 'spoof', symbol,
              message: `${formatDollarCompact(spoofValue)} bid @ ${formatPrice(price, 'crypto')} vanished`,
              value: spoofValue, side: 'buy', price,
            });
          }
        });
        
        prevOrderBookRef.current.asks.forEach((prevLevel, price) => {
          const currentLevel = currentAsks.get(price);
          const spoofValue = prevLevel.size * price;
          if (prevLevel.size > avgAskSize * 3 && spoofValue >= spoofMin &&
              (!currentLevel || currentLevel.size < prevLevel.size * 0.3) &&
              now - prevLevel.timestamp < 2000) {
            addSignal({
              type: 'spoof', symbol,
              message: `${formatDollarCompact(spoofValue)} ask @ ${formatPrice(price, 'crypto')} vanished`,
              value: spoofValue, side: 'sell', price,
            });
          }
        });
      }
      
      prevOrderBookRef.current = { bids: currentBids, asks: currentAsks, avgBidSize, avgAskSize };
    }, 500);
    
    return () => { clearInterval(interval); prevOrderBookRef.current = null; };
  }, [symbol, addSignal, getThresholds]);
  
  const getSignalStyle = (signal: AlgoSignal) => {
    switch (signal.type) {
      case 'whale': return signal.side === 'buy' ? "text-[#00FF41] font-bold" : "text-[#FF4545] font-bold";
      case 'velocity': return "text-[#EAB308] font-bold";
      case 'spoof': return "text-[#A855F7] font-bold";
      case 'wall': return signal.side === 'buy' ? "text-cyan-400 font-bold" : "text-pink-400 font-bold";
      default: return "text-gray-400";
    }
  };
  
  const getSignalBadge = (type: SignalType) => {
    const styles: Record<SignalType, { bg: string; text: string; label: string }> = {
      whale: { bg: 'bg-[#F97316]/20', text: 'text-[#F97316]', label: 'WHALE' },
      velocity: { bg: 'bg-[#EAB308]/20', text: 'text-[#EAB308]', label: 'SURGE' },
      spoof: { bg: 'bg-[#A855F7]/20', text: 'text-[#A855F7]', label: 'SPOOF' },
      wall: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'WALL' },
      imbalance: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'IMB' },
    };
    const s = styles[type] || { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'INFO' };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.bg} ${s.text} border border-current/30`}>{s.label}</span>;
  };
  
  return (
    <div className={cn("bg-black border border-gray-800 rounded-lg overflow-hidden flex flex-col", className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-black border-b border-gray-800 cursor-pointer flex-none"
           onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2">
          <span className="text-orange-500 font-bold text-sm font-mono">&gt;&gt; ALGO SIGNALS</span>
          <span className="text-gray-600 text-xs font-mono">[{signals.length}]</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500 font-mono">
            {tradesPerSec}/sec
            {avgTradesPerSec > 0 && <span className="text-gray-700 ml-1">(avg: {avgTradesPerSec.toFixed(0)})</span>}
          </span>
          <span className="text-gray-600 font-mono">{isExpanded ? '[-]' : '[+]'}</span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="flex items-center gap-4 px-3 py-1 bg-black border-b border-gray-800 text-xs flex-none">
          <div className="flex items-center gap-1">
            <span className="text-gray-600 font-mono">Whale:</span>
            <span className="text-orange-500 font-mono font-bold">${(getThresholds().whaleMin / 1000).toFixed(0)}k</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-600 font-mono">Velocity:</span>
            <span className={cn("font-mono font-bold tabular-nums",
              currentVelocityPct > 100 ? "text-[#EAB308]" : currentVelocityPct > 0 ? "text-[#00FF41]" : 
              currentVelocityPct < -50 ? "text-[#FF4545]" : "text-gray-500"
            )}>{currentVelocityPct >= 0 ? '+' : ''}{currentVelocityPct}%</span>
          </div>
        </div>
      )}
      
      {isExpanded && (
        <div className="flex-1 overflow-y-auto bg-black font-mono text-xs">
          {signals.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-700">&gt; Monitoring {symbol} for signals...</div>
          ) : (
            <div className="divide-y divide-gray-900/50">
              {signals.filter(s => s.symbol.toUpperCase() === symbol.toUpperCase()).map(signal => (
                <div key={signal.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-900/30">
                  <span className="text-gray-600 w-16 flex-none">{formatTimeShort(signal.timestamp)}</span>
                  <span className="flex-none">{getSignalBadge(signal.type)}</span>
                  <span className={cn("flex-1", getSignalStyle(signal))}>{signal.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default AlgoSignals;
