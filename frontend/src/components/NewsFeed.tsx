/**
 * NewsFeed - Real-time crypto news with sentiment indicators
 * 
 * Displays news from CryptoCompare with:
 * - Sentiment badges (bullish/bearish/neutral)
 * - Source attribution
 * - Relative timestamps
 * - Click to expand with full article link
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

// Individual news item
function NewsItem({ article }: { article: NewsArticle }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sentiment = getSentimentBadge(article.sentiment);
  
  return (
    <div 
      className={cn(
        "p-2 border-b border-gray-800/50 hover:bg-gray-900/50 cursor-pointer transition-colors",
        isExpanded && "bg-gray-900/30"
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-2">
        {/* Sentiment badge */}
        <span className={cn(
          "px-1 py-0.5 text-[10px] rounded border font-medium flex-shrink-0 mt-0.5",
          sentiment.className
        )}>
          {sentiment.text}
        </span>
        
        {/* Title and meta */}
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            "text-xs font-medium text-gray-200 leading-tight",
            !isExpanded && "line-clamp-2"
          )}>
            {article.title}
          </h4>
          
          {/* Expanded content */}
          {isExpanded && article.body && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              {article.body.length > 200 ? article.body.slice(0, 200) + '...' : article.body}
            </p>
          )}
          
          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-600">
              {formatNewsTime(article.published_on || article.publishedAt || Date.now())}
            </span>
            <span className="text-[10px] text-gray-700">·</span>
            <span className="text-[10px] text-orange-500/70">
              {article.source}
            </span>
            {article.tags && article.tags.length > 0 && (
              <>
                <span className="text-[10px] text-gray-700">·</span>
                <span className="text-[10px] text-gray-600">
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
              className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
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
  compact: _compact = false,
}: NewsFeedProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
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
      "bg-black rounded border border-gray-800 overflow-hidden font-mono flex flex-col",
      className
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-900/50 transition-colors flex-shrink-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-orange-500 uppercase">&gt;&gt; NEWS</span>
          <span className="text-xs text-gray-600">
            {symbol.toUpperCase()}
          </span>
          {articles.length > 0 && (
            <span className="px-1 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded">
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
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors px-1"
            title="Refresh news"
          >
            ↻
          </button>
          <span className="text-gray-600 text-xs">{isExpanded ? '[-]' : '[+]'}</span>
        </div>
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '300px' }}>
          {isLoading && articles.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-gray-600 text-xs">
              <span className="animate-pulse">Loading news...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-4 text-xs">
              <span className="text-[#FF4545]">{error}</span>
              <button 
                onClick={loadNews}
                className="mt-2 text-gray-500 hover:text-gray-400 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : articles.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-gray-600 text-xs">
              No recent news for {symbol.toUpperCase()}
            </div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {articles.map((article) => (
                <NewsItem key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
