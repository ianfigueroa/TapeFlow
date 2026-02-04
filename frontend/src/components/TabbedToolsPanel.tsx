/**
 * TabbedToolsPanel - Unified tabbed interface for Analytics, News, and Algo Signals
 * 
 * Provides proper vertical height for each tool instead of squashing into 50px strips.
 * Designed for the bottom quadrant of the Bento-box layout.
 */

import { useState, memo } from 'react';
import { cn } from '../lib/utils';
import { NewsFeed } from './NewsFeed';
import { AlgoSignals } from './AlgoSignals';
import { SessionStats } from './SessionStats';

type TabId = 'analytics' | 'news' | 'signals';

interface Tab {
  id: TabId;
  label: string;
  shortLabel: string;
  color: string;
}

const TABS: Tab[] = [
  { id: 'analytics', label: 'ANALYTICS', shortLabel: 'ANL', color: 'text-emerald-500' },
  { id: 'news', label: 'NEWS FEED', shortLabel: 'NEWS', color: 'text-blue-400' },
  { id: 'signals', label: 'ALGO SIGNALS', shortLabel: 'SIG', color: 'text-[#00FF41]' },
];

interface TabbedToolsPanelProps {
  symbol: string;
  className?: string;
}

export const TabbedToolsPanel = memo(function TabbedToolsPanel({
  symbol,
  className,
}: TabbedToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('analytics');

  const activeTabConfig = TABS.find(t => t.id === activeTab)!;

  return (
    <div className={cn(
      "flex flex-col h-full bg-black border border-gray-800 rounded overflow-hidden",
      className
    )}>
      {/* Tab Bar */}
      <div className="flex items-center border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-mono font-semibold tracking-wider transition-all",
              "border-b-2 -mb-[1px]",
              activeTab === tab.id
                ? cn(tab.color, "border-current bg-black/50")
                : "text-gray-600 border-transparent hover:text-gray-400 hover:bg-gray-900/50"
            )}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
        
        {/* Symbol indicator */}
        <div className="px-3 py-2 text-xs text-gray-600 font-mono border-l border-gray-800">
          {symbol}
        </div>
      </div>

      {/* Tab Content - Full height for readability */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'analytics' && (
          <div className="h-full overflow-auto">
            <SessionStats symbol={symbol} className="h-full border-0" />
          </div>
        )}
        
        {activeTab === 'news' && (
          <div className="h-full overflow-auto">
            <NewsFeed symbol={symbol} compact={false} />
          </div>
        )}
        
        {activeTab === 'signals' && (
          <div className="h-full overflow-auto">
            <AlgoSignals symbol={symbol} compact={false} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-gray-800 bg-gray-900/20 text-[10px] text-gray-600 font-mono flex-shrink-0">
        <span className={activeTabConfig.color}>● {activeTabConfig.label}</span>
        <span>{new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
      </div>
    </div>
  );
});

export default TabbedToolsPanel;
