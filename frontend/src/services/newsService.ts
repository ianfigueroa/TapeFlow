/**
 * News service for frontend
 * 
 * Fetches news from backend API and manages caching.
 * Integrates with WebSocket for real-time updates.
 */

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string;
  source: string;
  categories: string[];
  tags: string[];
  publishedAt: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevantSymbols: string[];
}

export interface NewsResponse {
  symbol: string;
  count: number;
  items: NewsItem[];
  cached: boolean;
  timestamp: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes (shorter than backend cache)

// Local cache
const cache: Map<string, { items: NewsItem[]; timestamp: number }> = new Map();

// Callbacks for real-time updates
const listeners: Set<(item: NewsItem) => void> = new Set();

/**
 * Fetch news for a symbol
 */
export async function fetchNews(symbol: string = 'BTC', forceRefresh: boolean = false): Promise<NewsItem[]> {
  const cleanSymbol = symbol.toUpperCase().replace('USDT', '');
  
  // Check local cache first
  if (!forceRefresh) {
    const cached = cache.get(cleanSymbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.items;
    }
  }
  
  try {
    const url = `${API_BASE}/api/news/${cleanSymbol}${forceRefresh ? '?refresh=true' : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch news: ${response.status}`);
    }
    
    const data: NewsResponse = await response.json();
    
    // Update local cache
    cache.set(cleanSymbol, {
      items: data.items,
      timestamp: Date.now(),
    });
    
    return data.items;
  } catch (error) {
    console.error('[News] Fetch error:', error);
    // Return stale cache if available
    return cache.get(cleanSymbol)?.items || [];
  }
}

/**
 * Subscribe to real-time news updates
 */
export function subscribeToNews(callback: (item: NewsItem) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Handle incoming news from WebSocket
 */
export function handleNewsMessage(item: NewsItem): void {
  // Update relevant caches
  for (const symbol of item.relevantSymbols) {
    const cached = cache.get(symbol);
    if (cached) {
      // Add to front if not already present
      if (!cached.items.find(i => i.id === item.id)) {
        cached.items.unshift(item);
        // Keep cache size bounded
        if (cached.items.length > 50) {
          cached.items.pop();
        }
      }
    }
  }
  
  // Notify listeners
  for (const listener of listeners) {
    listener(item);
  }
}

/**
 * Get cached news without fetching
 */
export function getCachedNews(symbol: string): NewsItem[] {
  const cleanSymbol = symbol.toUpperCase().replace('USDT', '');
  return cache.get(cleanSymbol)?.items || [];
}

/**
 * Clear all cached news
 */
export function clearNewsCache(): void {
  cache.clear();
}

/**
 * Format relative time for display
 */
export function formatNewsTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Get sentiment color class
 */
export function getSentimentColor(sentiment: NewsItem['sentiment']): string {
  switch (sentiment) {
    case 'positive': return 'text-[#00FF41]';
    case 'negative': return 'text-[#FF4545]';
    default: return 'text-gray-400';
  }
}

/**
 * Get sentiment badge class
 */
export function getSentimentBadgeClass(sentiment: NewsItem['sentiment']): string {
  switch (sentiment) {
    case 'positive': return 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/30';
    case 'negative': return 'bg-[#FF4545]/20 text-[#FF4545] border-[#FF4545]/30';
    default: return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}
