// Modal for adding new symbols - validates against Binance and shows popular pairs

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMarketStore } from '../stores/useMarketStore';
import { cn } from '../lib/utils';
import { getAssetTypeColor } from '../utils/formatters';
import type { SymbolInfo } from '../types';

const POPULAR_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'LTCUSDT'
];

interface SymbolSelectorProps {
  onClose?: () => void;
}

export function SymbolSelector({ onClose }: SymbolSelectorProps) {
  const [input, setInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<SymbolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const subscribe = useMarketStore((state) => state.subscribe);
  const addTab = useMarketStore((state) => state.addTab);
  const validateSymbol = useMarketStore((state) => state.validateSymbol);
  const activeSymbols = useMarketStore((state) => state.activeSymbols);
  const isConnected = useMarketStore((state) => state.isConnected);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleValidate = useCallback(async () => {
    if (!input.trim()) return;

    setIsValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const result = await validateSymbol(input.trim());
      if (result) {
        setValidationResult(result);
        if (!result.valid) {
          setError(result.error || 'Invalid symbol');
        }
      } else {
        setError('Failed to validate symbol');
      }
    } catch {
      setError('Validation error');
    } finally {
      setIsValidating(false);
    }
  }, [input, validateSymbol]);

  const handleSubscribe = useCallback((symbol: string) => {
    const upperSymbol = symbol.toUpperCase().trim();

    if (!upperSymbol.endsWith('USDT')) {
      alert('Invalid Symbol. Please use a valid Crypto Pair (e.g., BTCUSDT, ETHUSDT).');
      return;
    }

    if (activeSymbols.includes(upperSymbol)) {
      setError('Already subscribed to this symbol');
      return;
    }

    subscribe(upperSymbol, 'crypto');
    addTab({ symbol: upperSymbol, assetType: 'crypto' });

    setInput('');
    setValidationResult(null);
    setError(null);
    onClose?.();
  }, [subscribe, addTab, activeSymbols, onClose]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (validationResult?.valid) {
      handleSubscribe(validationResult.symbol);
    } else if (input.trim()) {
      handleSubscribe(input.trim());
    }
  }, [validationResult, input, handleSubscribe]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl w-full max-w-lg">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white">Add Symbol</h2>
        <p className="text-sm text-gray-400 mt-1">
          Enter a crypto pair ending in USDT (e.g., BTCUSDT)
        </p>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onBlur={handleValidate}
              placeholder="Enter crypto pair (e.g., BTCUSDT, ETHUSDT)"
              className={cn(
                "w-full bg-gray-800 text-white px-4 py-3 rounded-lg",
                "border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
                "outline-none transition-colors placeholder:text-gray-500"
              )}
              disabled={!isConnected}
            />
            {isValidating && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {validationResult && (
            <div className={cn(
              "mt-2 p-3 rounded-lg text-sm",
              validationResult.valid
                ? "bg-green-500/10 border border-green-500/20"
                : "bg-red-500/10 border border-red-500/20"
            )}>
              {validationResult.valid ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium">{validationResult.symbol}</span>
                    <span className="text-gray-400 ml-2">{validationResult.name}</span>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded text-xs", getAssetTypeColor(validationResult.assetType))}>
                    {validationResult.assetType.toUpperCase()}
                  </span>
                </div>
              ) : (
                <span className="text-red-400">{error}</span>
              )}
            </div>
          )}

          {error && !validationResult && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={!input.trim() || !isConnected}
            className={cn(
              "w-full mt-3 py-3 rounded-lg font-medium transition-colors",
              "bg-blue-600 hover:bg-blue-500 text-white",
              "disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
            )}
          >
            {!isConnected ? 'Connecting...' : 'Add Symbol'}
          </button>
        </form>

        <div className="mb-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Popular Pairs</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {POPULAR_SYMBOLS.map((symbol) => {
            const isActive = activeSymbols.includes(symbol);
            return (
              <button
                key={symbol}
                onClick={() => handleSubscribe(symbol)}
                disabled={isActive || !isConnected}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-mono transition-all border border-gray-700",
                  isActive
                    ? "bg-blue-600/20 border-blue-500 text-blue-400 cursor-not-allowed"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white",
                  !isConnected && "opacity-50 cursor-not-allowed"
                )}
              >
                {symbol}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
          <span className="text-sm text-gray-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
