// Bottom status bar - Paper Trading P&L, Recording, OPS

import { useEffect, useState } from 'react';
import { usePaperTradingStore } from '../stores/usePaperTradingStore';
import { useRecordingStore } from '../stores/useRecordingStore';
import { getTradeRate, getLatency } from '../services/dataBuffer';
import { cn } from '../lib/utils';

interface StatusBarProps {
  symbol: string;
  onPaperTradingClick?: () => void;
  onRecordingClick?: () => void;
}

export function StatusBar({ symbol, onPaperTradingClick, onRecordingClick }: StatusBarProps) {
  const { enabled: paperTradingEnabled, account, equity, position } = usePaperTradingStore();
  const { isRecording, tradeCount, duration } = useRecordingStore();

  const [ops, setOps] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  // Update OPS and latency
  useEffect(() => {
    const interval = setInterval(() => {
      const rate = getTradeRate(symbol);
      setOps(rate.current);
      setLatency(getLatency(symbol));
    }, 200);
    return () => clearInterval(interval);
  }, [symbol]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const pnl = account.totalPnL + (position?.unrealizedPnL || 0);

  return (
    <div className="h-7 bg-black border-t border-gray-800 flex items-center justify-between px-3 font-mono text-xs">
      {/* Left section - Paper Trading */}
      <div className="flex items-center gap-4">
        <button
          onClick={onPaperTradingClick}
          className={cn(
            "flex items-center gap-2 px-2 py-0.5 rounded hover:bg-gray-900 transition-colors",
            paperTradingEnabled ? "text-white" : "text-gray-600"
          )}
        >
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            paperTradingEnabled ? "bg-[#00FF41]" : "bg-gray-600"
          )} />
          <span className="text-gray-500">PAPER</span>
          {paperTradingEnabled && (
            <>
              <span className="text-gray-600">|</span>
              <span className={pnl >= 0 ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400">${equity.toFixed(0)}</span>
            </>
          )}
        </button>

        <div className="h-4 w-px bg-gray-800" />

        <button
          onClick={onRecordingClick}
          className={cn(
            "flex items-center gap-2 px-2 py-0.5 rounded hover:bg-gray-900 transition-colors",
            isRecording ? "text-[#FF4545]" : "text-gray-600"
          )}
        >
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            isRecording ? "bg-[#FF4545] animate-pulse" : "bg-gray-600"
          )} />
          <span className={isRecording ? "text-[#FF4545]" : "text-gray-500"}>
            {isRecording ? 'REC' : 'REC'}
          </span>
          {isRecording && (
            <>
              <span className="text-gray-600">|</span>
              <span className="text-white">{tradeCount}</span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400">{formatDuration(duration)}</span>
            </>
          )}
        </button>
      </div>

      {/* Right section - Performance metrics */}
      <div className="flex items-center gap-4 text-gray-500">
        {latency !== null && (
          <>
            <div className="flex items-center gap-1">
              <span>LAT</span>
              <span className={cn(
                latency < 50 ? 'text-[#00FF41]' : latency < 200 ? 'text-yellow-400' : 'text-[#FF4545]'
              )}>
                {latency}ms
              </span>
            </div>
            <div className="h-4 w-px bg-gray-800" />
          </>
        )}

        <div className="flex items-center gap-1">
          <span>OPS</span>
          <span className={cn(
            ops > 100 ? 'text-[#00FF41]' : ops > 10 ? 'text-yellow-400' : 'text-gray-400'
          )}>
            {ops}/s
          </span>
        </div>
      </div>
    </div>
  );
}
