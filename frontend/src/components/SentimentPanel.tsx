/**
 * SentimentPanel - Real-time market sentiment indicator
 * 
 * Displays bullish/bearish sentiment based on order flow analysis.
 * Uses SentimentEngine to process CVD, OBI, VWAP drift, and relative strength.
 * 
 * Features:
 * - Color-coded sentiment gauge (green/red/gray)
 * - Confidence percentage
 * - Contributing factor breakdown
 * - 5-minute sentiment history sparkline
 */

import { useState, useEffect, useRef, memo } from 'react';
import { cn } from '../lib/utils';
import { SentimentEngine } from '../sentiment';
import type { SentimentSignal, SentimentHistory, SentimentBias } from '../sentiment';
import { AnalyticsEngine } from '../analytics';
import { subscribeToTrades, getCurrentOrderBook } from '../services/dataBuffer';
import type { Trade } from '../types';

interface SentimentPanelProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

// Sparkline component for sentiment history
function SentimentSparkline({ history, width = 120, height = 32 }: { 
  history: SentimentHistory[]; 
  width?: number; 
  height?: number;
}) {
  if (history.length < 2) {
    return (
      <div 
        className="bg-gray-900/50 rounded flex items-center justify-center text-gray-600 text-xs"
        style={{ width, height }}
      >
        Collecting data...
      </div>
    );
  }
  
  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Normalize scores to chart coordinates
  const minScore = -100;
  const maxScore = 100;
  const range = maxScore - minScore;
  
  const points = history.map((h, i) => {
    const x = padding + (i / (history.length - 1)) * chartWidth;
    const y = padding + ((maxScore - h.score) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');
  
  // Zero line position
  const zeroY = padding + (maxScore / range) * chartHeight;
  
  // Determine color based on latest score
  const latestScore = history[history.length - 1]?.score || 0;
  const strokeColor = latestScore > 20 ? '#00FF41' : latestScore < -20 ? '#FF4545' : '#6B7280';
  
  return (
    <svg width={width} height={height} className="bg-gray-900/50 rounded">
      {/* Zero line */}
      <line 
        x1={padding} 
        y1={zeroY} 
        x2={width - padding} 
        y2={zeroY} 
        stroke="#374151" 
        strokeWidth="1" 
        strokeDasharray="2,2" 
      />
      {/* Sentiment line */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

// Indicator row component
function IndicatorRow({ 
  label, 
  value, 
}: { 
  label: string; 
  value: number; 
}) {
  const barWidth = Math.min(Math.abs(value), 100);
  const isPositive = value > 0;
  
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-gray-500 uppercase">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden relative">
        <div className="absolute inset-0 flex">
          <div className="w-1/2" />
          <div className="w-px bg-gray-600" />
          <div className="w-1/2" />
        </div>
        <div 
          className={cn(
            "absolute h-full rounded-full transition-all duration-300",
            isPositive ? "bg-[#00FF41]" : "bg-[#FF4545]"
          )}
          style={{
            width: `${barWidth / 2}%`,
            left: isPositive ? '50%' : `${50 - barWidth / 2}%`,
          }}
        />
      </div>
      <span className={cn(
        "w-10 text-right tabular-nums",
        value > 20 ? "text-[#00FF41]" : value < -20 ? "text-[#FF4545]" : "text-gray-400"
      )}>
        {value > 0 ? '+' : ''}{value}
      </span>
    </div>
  );
}

export const SentimentPanel = memo(function SentimentPanel({
  symbol,
  className,
  compact: _compact = false,
}: SentimentPanelProps) {
  const [signal, setSignal] = useState<SentimentSignal | null>(null);
  const [history, setHistory] = useState<SentimentHistory[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Engine refs
  const sentimentEngineRef = useRef<SentimentEngine | null>(null);
  const analyticsEngineRef = useRef<AnalyticsEngine | null>(null);
  const currentSymbolRef = useRef<string>(symbol);
  const lastPriceRef = useRef<number>(0);
  
  // Initialize engines on symbol change
  useEffect(() => {
    if (currentSymbolRef.current !== symbol) {
      sentimentEngineRef.current?.reset();
      analyticsEngineRef.current?.reset();
      setSignal(null);
      setHistory([]);
      currentSymbolRef.current = symbol;
    }
    
    if (!sentimentEngineRef.current) {
      sentimentEngineRef.current = new SentimentEngine(symbol);
    }
    if (!analyticsEngineRef.current) {
      analyticsEngineRef.current = new AnalyticsEngine(symbol);
    }
  }, [symbol]);
  
  // Process trades
  useEffect(() => {
    const upperSymbol = symbol.toUpperCase();
    
    const unsubscribe = subscribeToTrades((trade: Trade) => {
      if (trade.symbol.toUpperCase() !== upperSymbol) return;
      
      lastPriceRef.current = trade.price;
      analyticsEngineRef.current?.processTrade(trade);
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Update sentiment periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const analytics = analyticsEngineRef.current;
      const sentiment = sentimentEngineRef.current;
      
      if (!analytics || !sentiment) return;
      
      // Process order book
      const orderBook = getCurrentOrderBook(symbol);
      if (orderBook) {
        analytics.processOrderBook(orderBook);
      }
      
      // Get analytics snapshot and process sentiment
      const snapshot = analytics.getSnapshot();
      const newSignal = sentiment.process(snapshot, lastPriceRef.current);
      
      setSignal(newSignal);
      setHistory(sentiment.getHistory());
    }, 2000); // Update every 2 seconds
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  // Sentiment display helpers
  const getBiasColor = (bias: SentimentBias): string => {
    switch (bias) {
      case 'BULLISH': return 'text-[#00FF41]';
      case 'BEARISH': return 'text-[#FF4545]';
      default: return 'text-gray-400';
    }
  };
  
  const getBiasBgColor = (bias: SentimentBias): string => {
    switch (bias) {
      case 'BULLISH': return 'bg-[#00FF41]/10 border-[#00FF41]/30';
      case 'BEARISH': return 'bg-[#FF4545]/10 border-[#FF4545]/30';
      default: return 'bg-gray-800/50 border-gray-700';
    }
  };
  
  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'improving': return '/\\';
      case 'declining': return '\\/';
      default: return '--';
    }
  };
  
  return (
    <div className={cn(
      "bg-black rounded border border-gray-800 overflow-hidden font-mono",
      className
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-900/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-orange-500 uppercase">&gt;&gt; SENTIMENT</span>
          {signal && (
            <span className={cn(
              "px-1.5 py-0.5 text-xs rounded border",
              getBiasBgColor(signal.bias),
              getBiasColor(signal.bias)
            )}>
              {signal.bias}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {signal && (
            <span className={cn("text-xs tabular-nums", getBiasColor(signal.bias))}>
              {signal.score > 0 ? '+' : ''}{signal.score.toFixed(0)}
            </span>
          )}
          <span className="text-gray-600 text-xs">{isExpanded ? '[-]' : '[+]'}</span>
        </div>
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div className="p-2 space-y-3">
          {signal ? (
            <>
              {/* Main sentiment display */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Large score display */}
                  <div className={cn(
                    "text-2xl font-bold tabular-nums",
                    getBiasColor(signal.bias)
                  )}>
                    {signal.score > 0 ? '+' : ''}{signal.score.toFixed(0)}
                  </div>
                  
                  {/* Confidence and trend */}
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">
                      Confidence: <span className="text-white">{signal.confidence}%</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      Trend: <span className={cn(
                        signal.trend === 'improving' ? 'text-[#00FF41]' :
                        signal.trend === 'declining' ? 'text-[#FF4545]' : 'text-gray-400'
                      )}>
                        {getTrendIcon(signal.trend)} {signal.trend}
                      </span>
                    </span>
                  </div>
                </div>
                
                {/* Sparkline */}
                <SentimentSparkline history={history} />
              </div>
              
              {/* Indicator breakdown */}
              <div className="space-y-1.5 pt-2 border-t border-gray-800">
                <div className="text-xs text-gray-500 uppercase mb-2">Contributing Factors</div>
                {signal.indicators.map((indicator) => (
                  <IndicatorRow
                    key={indicator.source}
                    label={indicator.source}
                    value={indicator.value}
                  />
                ))}
              </div>
              
              {/* Summary */}
              <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">
                {signal.indicators.find(i => i.source === 'cvd')?.description || 'Analyzing order flow...'}
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-gray-600 text-xs">
              <div className="mb-2">Initializing sentiment analysis...</div>
              <div className="text-gray-700">Collecting order flow data</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
