/**
 * NewsFeed - Real-time crypto news with sentiment indicators
 * 
 * Displays news from CryptoCompare with:
 * - Sentiment badges (bullish/bearish/neutral)
 * - Source attribution
 * - Relative timestamps
 * - Click to expand with full article link
 * 
 * Updated: Improved typography for readability (larger text, better line height)
 */

import { useState, useEffect, memo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { fetchNews, subscribeToNews, formatNewsTime, type NewsItem } from '../services/newsService';

type NewsArticle = NewsItem & { published_on?: number };

interface NewsFeedProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

// Sentiment badge colors
function getSentimentBadge(sentiment: string | undefined): { text: string; className: string } {
  switch (sentiment?.toLowerCase()) {
    case 'bullish':
      return { text: 'BULL', className: 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30' };
    case 'bearish':
      return { text: 'BEAR', className: 'bg-[#FF4545]/10 text-[#FF4545] border-[#FF4545]/30' };
    default:
      return { text: 'NEUT', className: 'bg-gray-700/50 text-gray-400 border-gray-600' };
  }
}

// Individual news item with improved typography
function NewsItemComponent({ article, compact: _compact }: { article: NewsArticle; compact?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sentiment = getSentimentBadge(article.sentiment);
  
  return (
    <div 
      className={cn(
        "px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-900/50 cursor-pointer transition-colors",
        isExpanded && "bg-gray-900/30"
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-2.5">
        {/* Sentiment badge */}
        <span className={cn(
          "px-1.5 py-0.5 text-[10px] rounded border font-semibold flex-shrink-0 mt-0.5",
          sentiment.className
        )}>
          {sentiment.text}
        </span>
        
        {/* Title and meta */}
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            // IMPROVED: Larger font, better line height for readability
            "text-sm font-medium text-gray-100 leading-relaxed",
            !isExpanded && "line-clamp-2"
          )}>
            {article.title}
          </h4>
          
          {/* Expanded content */}
          {isExpanded && article.body && (
            <p className={cn(
              // IMPROVED: Better font size and line height for body text
              "text-sm text-gray-400 mt-2 leading-relaxed"
            )}>
              {article.body.length > 300 ? article.body.slice(0, 300) + '...' : article.body}
            </p>
          )}
          
          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-gray-500">
              {formatNewsTime(article.published_on || article.publishedAt || Date.now())}
            </span>
            <span className="text-xs text-gray-700">·</span>
            <span className="text-xs text-orange-500/80 font-medium">
              {article.source}
            </span>
            {article.tags && article.tags.length > 0 && (
              <>
                <span className="text-xs text-gray-700">·</span>
                <span className="text-xs text-gray-500">
                  {article.tags.slice(0, 2).join(', ')}
                </span>
              </>
            )}
          </div>
          
          {/* Link when expanded */}
          {isExpanded && (
            <a 
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              Read full article →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export const NewsFeed = memo(function NewsFeed({
  symbol,
  className,
  compact = false,
}: NewsFeedProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Fetch initial news
  const loadNews = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const news = await fetchNews(symbol);
      setArticles(news);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch news:', err);
      setError('Failed to load news');
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);
  
  // Initial load
  useEffect(() => {
    loadNews();
  }, [loadNews]);
  
  // Subscribe to live updates
  useEffect(() => {
    const unsubscribe = subscribeToNews((newArticle: NewsItem) => {
      // Check if relevant to this symbol
      const isRelevant = 
        newArticle.tags?.some((tag: string) => 
          tag.toUpperCase().includes(symbol.toUpperCase()) ||
          symbol.toUpperCase().includes(tag.toUpperCase())
        ) || 
        newArticle.title.toUpperCase().includes(symbol.toUpperCase());
      
      const relevant = isRelevant ? [newArticle] : [];
      
      if (relevant.length > 0) {
        setArticles(prev => {
          // Merge new articles, dedupe by id
          const existingIds = new Set(prev.map((a: NewsArticle) => a.id));
          const newOnes = relevant.filter((a: NewsItem) => !existingIds.has(a.id));
          if (newOnes.length === 0) return prev;
          return [...newOnes.map(a => ({ ...a, published_on: a.publishedAt })), ...prev].slice(0, 50) as NewsArticle[];
        });
        setLastUpdate(new Date());
      }
    });
    
    return () => unsubscribe();
  }, [symbol]);
  
  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(loadNews, 120000);
    return () => clearInterval(interval);
  }, [loadNews]);
  
  return (
    <div className={cn(
      "bg-black rounded border border-gray-800 overflow-hidden font-mono flex flex-col h-full",
      className
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/30 flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-400 font-semibold uppercase tracking-wider">NEWS</span>
          <span className="text-xs text-gray-600">
            {symbol.toUpperCase()}
          </span>
          {articles.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded">
              {articles.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-[10px] text-gray-600">
              {formatNewsTime(Math.floor(lastUpdate.getTime() / 1000))}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadNews();
            }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors px-1"
            title="Refresh news"
          >
            ↻
          </button>
        </div>
      </div>
      
      {/* Content - Scrollable with full height */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && articles.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-gray-600 text-sm">
            <span className="animate-pulse">Loading news...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-6 text-sm">
            <span className="text-[#FF4545]">{error}</span>
            <button 
              onClick={loadNews}
              className="mt-2 text-gray-500 hover:text-gray-400 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-gray-600 text-sm">
            No recent news for {symbol.toUpperCase()}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {articles.map((article) => (
              <NewsItemComponent key={article.id} article={article} compact={compact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
