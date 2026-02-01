/**
 * NewsAdapter - Crypto news aggregation service
 * 
 * Fetches and caches cryptocurrency news from CryptoCompare API.
 * Provides REST endpoint and WebSocket broadcast for new articles.
 * 
 * Features:
 * - 5-minute cache to respect rate limits
 * - Symbol filtering (BTC, ETH, etc.)
 * - Basic sentiment classification from title keywords
 * - WebSocket broadcast for real-time updates
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

export interface NewsCache {
  items: NewsItem[];
  lastFetch: number;
  symbol: string;
}

// Keywords for basic sentiment analysis
const POSITIVE_KEYWORDS = [
  'surge', 'soar', 'rally', 'bull', 'gain', 'rise', 'jump', 'high',
  'breakout', 'adoption', 'partnership', 'approval', 'etf', 'institutional',
  'record', 'milestone', 'growth', 'upgrade', 'bullish', 'moon'
];

const NEGATIVE_KEYWORDS = [
  'crash', 'plunge', 'dump', 'bear', 'fall', 'drop', 'low', 'decline',
  'hack', 'exploit', 'scam', 'fraud', 'ban', 'regulation', 'sec', 'lawsuit',
  'bankruptcy', 'collapse', 'liquidation', 'bearish', 'fear'
];

// Symbol mappings for filtering
const SYMBOL_KEYWORDS: Record<string, string[]> = {
  'BTC': ['bitcoin', 'btc', 'satoshi'],
  'ETH': ['ethereum', 'eth', 'vitalik'],
  'SOL': ['solana', 'sol'],
  'BNB': ['binance', 'bnb'],
  'XRP': ['ripple', 'xrp'],
  'DOGE': ['dogecoin', 'doge', 'shiba'],
  'ADA': ['cardano', 'ada'],
  'AVAX': ['avalanche', 'avax'],
  'DOT': ['polkadot', 'dot'],
  'MATIC': ['polygon', 'matic'],
};

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ARTICLES_PER_FETCH = 50;

export class NewsAdapter {
  private cache: Map<string, NewsCache> = new Map();
  private apiKey: string;
  private baseUrl: string = 'https://min-api.cryptocompare.com/data/v2';
  private newsBroadcaster: ((item: NewsItem) => void) | null = null;
  private lastSeenIds: Set<string> = new Set();

  constructor(apiKey?: string) {
    // CryptoCompare allows limited free access without key
    this.apiKey = apiKey || process.env.CRYPTOCOMPARE_API_KEY || '';
  }

  /**
   * Set callback for broadcasting new news items
   */
  onNews(callback: (item: NewsItem) => void): void {
    this.newsBroadcaster = callback;
  }

  /**
   * Fetch news for a symbol (e.g., 'BTC', 'ETH')
   * Returns cached data if available and fresh
   */
  async getNews(symbol: string = 'BTC', forceRefresh: boolean = false): Promise<NewsItem[]> {
    const upperSymbol = symbol.toUpperCase().replace('USDT', '');
    const cached = this.cache.get(upperSymbol);
    
    // Return cache if fresh
    if (!forceRefresh && cached && Date.now() - cached.lastFetch < CACHE_DURATION_MS) {
      return cached.items;
    }
    
    try {
      const items = await this.fetchFromApi(upperSymbol);
      
      // Update cache
      this.cache.set(upperSymbol, {
        items,
        lastFetch: Date.now(),
        symbol: upperSymbol,
      });
      
      // Broadcast new items
      this.broadcastNewItems(items);
      
      return items;
    } catch (error) {
      console.error(`[News] Failed to fetch news for ${upperSymbol}:`, error);
      // Return stale cache if available
      return cached?.items || [];
    }
  }

  /**
   * Fetch news from CryptoCompare API
   */
  private async fetchFromApi(symbol: string): Promise<NewsItem[]> {
    const categories = this.getCategories(symbol);
    const url = new URL(`${this.baseUrl}/news/`);
    
    // Add query params
    url.searchParams.set('categories', categories);
    url.searchParams.set('sortOrder', 'latest');
    url.searchParams.set('extraParams', 'TapeFlow');
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (this.apiKey) {
      headers['authorization'] = `Apikey ${this.apiKey}`;
    }
    
    const response = await fetch(url.toString(), { headers });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.Response === 'Error') {
      throw new Error(data.Message || 'Unknown API error');
    }
    
    // Transform API response to our format
    const items: NewsItem[] = (data.Data || [])
      .slice(0, MAX_ARTICLES_PER_FETCH)
      .map((article: any) => this.transformArticle(article, symbol));
    
    return items;
  }

  /**
   * Transform CryptoCompare article to our format
   */
  private transformArticle(article: any, requestedSymbol: string): NewsItem {
    const title = article.title || '';
    const body = article.body || '';
    const combined = `${title} ${body}`.toLowerCase();
    
    // Detect sentiment from keywords
    const sentiment = this.analyzeSentiment(combined);
    
    // Find relevant symbols
    const relevantSymbols = this.findRelevantSymbols(combined, requestedSymbol);
    
    return {
      id: article.id?.toString() || `${Date.now()}-${Math.random()}`,
      title: title,
      body: body.slice(0, 500), // Truncate for performance
      url: article.url || '',
      imageUrl: article.imageurl || '',
      source: article.source_info?.name || article.source || 'Unknown',
      categories: article.categories?.split('|') || [],
      tags: article.tags?.split('|') || [],
      publishedAt: (article.published_on || 0) * 1000, // Convert to ms
      sentiment,
      relevantSymbols,
    };
  }

  /**
   * Simple keyword-based sentiment analysis
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    let positiveScore = 0;
    let negativeScore = 0;
    
    for (const keyword of POSITIVE_KEYWORDS) {
      if (text.includes(keyword)) positiveScore++;
    }
    
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (text.includes(keyword)) negativeScore++;
    }
    
    if (positiveScore > negativeScore + 1) return 'positive';
    if (negativeScore > positiveScore + 1) return 'negative';
    return 'neutral';
  }

  /**
   * Find which symbols are mentioned in the article
   */
  private findRelevantSymbols(text: string, requestedSymbol: string): string[] {
    const symbols: string[] = [requestedSymbol];
    
    for (const [symbol, keywords] of Object.entries(SYMBOL_KEYWORDS)) {
      if (symbol === requestedSymbol) continue;
      
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          symbols.push(symbol);
          break;
        }
      }
    }
    
    return [...new Set(symbols)];
  }

  /**
   * Get CryptoCompare category string for a symbol
   */
  private getCategories(symbol: string): string {
    // CryptoCompare uses these category IDs
    const categoryMap: Record<string, string> = {
      'BTC': 'BTC',
      'ETH': 'ETH',
      'BNB': 'BNB',
      'SOL': 'Altcoin',
      'XRP': 'XRP',
      'ADA': 'ADA',
    };
    
    return categoryMap[symbol] || 'Altcoin';
  }

  /**
   * Broadcast only genuinely new items
   */
  private broadcastNewItems(items: NewsItem[]): void {
    if (!this.newsBroadcaster) return;
    
    for (const item of items) {
      if (!this.lastSeenIds.has(item.id)) {
        this.lastSeenIds.add(item.id);
        this.newsBroadcaster(item);
      }
    }
    
    // Keep lastSeenIds from growing unbounded
    if (this.lastSeenIds.size > 500) {
      const idsArray = Array.from(this.lastSeenIds);
      this.lastSeenIds = new Set(idsArray.slice(-250));
    }
  }

  /**
   * Get all cached news
   */
  getAllCached(): NewsItem[] {
    const allItems: NewsItem[] = [];
    for (const cache of this.cache.values()) {
      allItems.push(...cache.items);
    }
    // Sort by publish date, newest first
    return allItems.sort((a, b) => b.publishedAt - a.publishedAt);
  }

  /**
   * Get cache stats
   */
  getStats(): { cachedSymbols: string[]; totalItems: number; lastUpdate: number } {
    const cachedSymbols = Array.from(this.cache.keys());
    let totalItems = 0;
    let lastUpdate = 0;
    
    for (const cache of this.cache.values()) {
      totalItems += cache.items.length;
      if (cache.lastFetch > lastUpdate) {
        lastUpdate = cache.lastFetch;
      }
    }
    
    return { cachedSymbols, totalItems, lastUpdate };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.lastSeenIds.clear();
  }
}
