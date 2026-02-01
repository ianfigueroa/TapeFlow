/**
 * QuickSymbolSelector - Inline searchable symbol dropdown for header
 * 
 * Features:
 * - Click to expand dropdown
 * - Type to filter symbols
 * - Show popular symbols at top
 * - Quick switch between instruments
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '../lib/utils';
import { useMarketStore } from '../stores/useMarketStore';
import { useTheme } from '../hooks/useTheme';

// Popular trading pairs
const POPULAR_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'LTCUSDT',
  'ATOMUSDT', 'UNIUSDT', 'NEARUSDT', 'APTUSDT',
];

// Icons
const ChevronDownIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

interface QuickSymbolSelectorProps {
  className?: string;
}

export function QuickSymbolSelector({ className }: QuickSymbolSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { isHacker } = useTheme();
  
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const activeSymbols = useMarketStore((state) => state.activeSymbols);
  const subscribe = useMarketStore((state) => state.subscribe);
  const addTab = useMarketStore((state) => state.addTab);
  const selectSymbol = useMarketStore((state) => state.selectSymbol);
  const clearTrades = useMarketStore((state) => state.clearTrades);
  
  // Filter symbols based on search
  const filteredSymbols = useMemo(() => {
    const query = searchQuery.toUpperCase().trim();
    
    if (!query) {
      // Show active symbols first, then popular
      const active = activeSymbols.filter(s => s !== selectedSymbol);
      const popular = POPULAR_SYMBOLS.filter(s => !activeSymbols.includes(s));
      return [...active, ...popular];
    }
    
    // Filter by query
    const allSymbols = [...new Set([...activeSymbols, ...POPULAR_SYMBOLS])];
    return allSymbols.filter(s => s.includes(query));
  }, [searchQuery, activeSymbols, selectedSymbol]);
  
  // Handle symbol selection
  const handleSelectSymbol = useCallback((symbol: string) => {
    const upperSymbol = symbol.toUpperCase();
    
    // If not already subscribed, subscribe first
    if (!activeSymbols.includes(upperSymbol)) {
      subscribe(upperSymbol, 'crypto');
      addTab({ symbol: upperSymbol, assetType: 'crypto' });
    }
    
    // Clear old data and select new symbol
    clearTrades(upperSymbol);
    selectSymbol(upperSymbol);
    
    // Close dropdown
    setIsOpen(false);
    setSearchQuery('');
    setHighlightIndex(0);
  }, [activeSymbols, subscribe, addTab, selectSymbol, clearTrades]);
  
  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(i => Math.min(i + 1, filteredSymbols.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredSymbols[highlightIndex]) {
          handleSelectSymbol(filteredSymbols[highlightIndex]);
        } else if (searchQuery.trim()) {
          // Allow custom symbol entry
          handleSelectSymbol(searchQuery);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  }, [isOpen, filteredSymbols, highlightIndex, searchQuery, handleSelectSymbol]);
  
  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);
  
  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);
  
  // Reset highlight on filter change
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredSymbols.length]);
  
  const accentColor = isHacker ? '#00FF00' : '#58a6ff';
  
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono",
          "transition-all duration-150",
          isOpen
            ? "border-[var(--tf-accent-primary)] bg-[var(--tf-bg-tertiary)]"
            : "border-[var(--tf-border-primary)] hover:border-[var(--tf-border-secondary)] bg-[var(--tf-bg-secondary)]"
        )}
        style={{ 
          color: selectedSymbol ? accentColor : 'var(--tf-text-secondary)',
        }}
      >
        <span className="font-semibold">
          {selectedSymbol || 'SELECT'}
        </span>
        <ChevronDownIcon />
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-1 w-64 rounded-lg border shadow-xl z-50 overflow-hidden"
          style={{ 
            backgroundColor: 'var(--tf-bg-secondary)',
            borderColor: 'var(--tf-border-primary)',
          }}
        >
          {/* Search input */}
          <div className="p-2 border-b" style={{ borderColor: 'var(--tf-border-primary)' }}>
            <div className="relative">
              <SearchIcon />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                placeholder="Search symbol..."
                className={cn(
                  "w-full pl-7 pr-3 py-1.5 rounded text-xs font-mono",
                  "outline-none transition-colors",
                  "placeholder:text-[var(--tf-text-muted)]"
                )}
                style={{
                  backgroundColor: 'var(--tf-bg-tertiary)',
                  color: 'var(--tf-text-primary)',
                  border: '1px solid var(--tf-border-secondary)',
                }}
              />
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--tf-text-muted)]">
                <SearchIcon />
              </div>
            </div>
          </div>
          
          {/* Active symbols section */}
          {activeSymbols.length > 0 && !searchQuery && (
            <div className="px-2 py-1 border-b" style={{ borderColor: 'var(--tf-border-primary)' }}>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--tf-text-muted)' }}>
                Active
              </span>
            </div>
          )}
          
          {/* Symbol list */}
          <div className="max-h-64 overflow-y-auto">
            {filteredSymbols.length > 0 ? (
              filteredSymbols.map((symbol, index) => {
                const isActive = activeSymbols.includes(symbol);
                const isSelected = symbol === selectedSymbol;
                const isHighlighted = index === highlightIndex;
                
                return (
                  <button
                    key={symbol}
                    onClick={() => handleSelectSymbol(symbol)}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs font-mono",
                      "transition-colors"
                    )}
                    style={{
                      backgroundColor: isHighlighted ? 'var(--tf-bg-tertiary)' : 'transparent',
                      color: isSelected ? accentColor : 'var(--tf-text-primary)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {symbol}
                      {isActive && !isSelected && (
                        <span 
                          className="px-1 py-0.5 rounded text-[9px]"
                          style={{ 
                            backgroundColor: 'var(--tf-bg-tertiary)',
                            color: 'var(--tf-text-muted)',
                          }}
                        >
                          OPEN
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <span style={{ color: accentColor }}>
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center">
                <p className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
                  No symbols found
                </p>
                {searchQuery && (
                  <button
                    onClick={() => handleSelectSymbol(searchQuery)}
                    className="mt-2 px-3 py-1.5 rounded text-xs font-mono border"
                    style={{
                      borderColor: accentColor,
                      color: accentColor,
                    }}
                  >
                    Add "{searchQuery}"
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Hint */}
          <div 
            className="px-3 py-2 border-t text-[10px]"
            style={{ 
              borderColor: 'var(--tf-border-primary)',
              color: 'var(--tf-text-muted)',
            }}
          >
            <span className="opacity-60">↑↓</span> navigate · <span className="opacity-60">↵</span> select · <span className="opacity-60">esc</span> close
          </div>
        </div>
      )}
    </div>
  );
}
