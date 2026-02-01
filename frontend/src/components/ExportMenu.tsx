// Export menu for CSV export of trades, sessions, alerts

import { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { useMarketStore } from '../stores/useMarketStore';
import { useRecordingStore } from '../stores/useRecordingStore';
import type { TradeWithAnalytics, Trade } from '../types';

interface ExportMenuProps {
  symbol?: string;
  className?: string;
}

function formatTradeCSV(trades: TradeWithAnalytics[]): string {
  const headers = [
    'timestamp',
    'symbol',
    'price',
    'volume',
    'side',
    'value',
    'vwap',
    'delta',
    'relativeStrength',
    'momentum',
    'id',
  ].join(',');

  const rows = trades.map((trade) => [
    new Date(trade.timestamp).toISOString(),
    trade.symbol,
    trade.price,
    trade.volume,
    trade.side,
    (trade.price * trade.volume).toFixed(2),
    trade.vwap?.toFixed(2) || '',
    trade.delta?.toFixed(2) || '',
    trade.relativeStrength?.toFixed(2) || '',
    trade.momentum?.toFixed(4) || '',
    trade.id,
  ].join(','));

  return [headers, ...rows].join('\n');
}

function formatRawTradeCSV(trades: Trade[]): string {
  const headers = [
    'timestamp',
    'symbol',
    'price',
    'volume',
    'side',
    'value',
    'id',
  ].join(',');

  const rows = trades.map((trade) => [
    new Date(trade.timestamp).toISOString(),
    trade.symbol,
    trade.price,
    trade.volume,
    trade.side,
    (trade.price * trade.volume).toFixed(2),
    trade.id,
  ].join(','));

  return [headers, ...rows].join('\n');
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportMenu({ symbol, className }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const symbols = useMarketStore((state) => state.symbols);
  const combinedTrades = useMarketStore((state) => state.combinedTrades);
  const { sessions } = useRecordingStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleExportTape = () => {
    if (symbol) {
      const symbolData = symbols.get(symbol);
      if (symbolData && symbolData.trades.length > 0) {
        const csv = formatTradeCSV(symbolData.trades);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadCSV(csv, `tape_${symbol}_${timestamp}.csv`);
      }
    }
    setIsOpen(false);
  };

  const handleExportCombined = () => {
    if (combinedTrades.length > 0) {
      const csv = formatTradeCSV(combinedTrades);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadCSV(csv, `tape_combined_${timestamp}.csv`);
    }
    setIsOpen(false);
  };

  const handleExportSession = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      const csv = formatRawTradeCSV(session.trades);
      const timestamp = new Date(session.startTime).toISOString().replace(/[:.]/g, '-');
      downloadCSV(csv, `session_${session.symbol}_${timestamp}.csv`);
    }
    setIsOpen(false);
  };

  const currentTrades = symbol ? symbols.get(symbol)?.trades : null;
  const hasData = (currentTrades && currentTrades.length > 0) || combinedTrades.length > 0 || sessions.length > 0;

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'px-2 py-1 rounded text-xs font-mono transition-colors',
          hasData
            ? 'text-gray-400 hover:text-white hover:bg-gray-900'
            : 'text-gray-600 cursor-not-allowed'
        )}
        disabled={!hasData}
      >
        EXPORT
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-black border border-gray-800 rounded shadow-lg z-50 min-w-[200px]">
          <div className="py-1">
            {currentTrades && currentTrades.length > 0 && (
              <button
                onClick={handleExportTape}
                className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-gray-900 flex items-center justify-between"
              >
                <span>Export {symbol} Tape</span>
                <span className="text-gray-600">{currentTrades.length} trades</span>
              </button>
            )}

            {combinedTrades.length > 0 && (
              <button
                onClick={handleExportCombined}
                className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-gray-900 flex items-center justify-between"
              >
                <span>Export Combined Tape</span>
                <span className="text-gray-600">{combinedTrades.length} trades</span>
              </button>
            )}

            {sessions.length > 0 && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <div className="px-3 py-1 text-xs text-gray-600 uppercase">Recorded Sessions</div>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleExportSession(session.id)}
                    className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-gray-900 flex items-center justify-between"
                  >
                    <span>{session.symbol}</span>
                    <span className="text-gray-600">{session.trades.length} trades</span>
                  </button>
                ))}
              </>
            )}

            {!hasData && (
              <div className="px-3 py-2 text-xs text-gray-600">
                No data to export
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
