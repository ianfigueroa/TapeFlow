/**
 * VolumeProfileCalculator - Real-time volume profile analysis
 * 
 * Calculates volume distribution across price levels to identify:
 * - POC (Point of Control): Price level with highest volume
 * - VAH/VAL (Value Area High/Low): Range containing 70% of volume
 * - HVN (High Volume Nodes): Significant volume clusters
 * - LVN (Low Volume Nodes): Volume gaps/thin areas
 * 
 * Design:
 * - Aggregates trades into price buckets (tick size configurable)
 * - Tracks buy/sell volume separately (delta profile)
 * - Maintains rolling window (configurable time period)
 * - Memory efficient with fixed bucket count
 */

export interface VolumeNode {
  price: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;         // buyVolume - sellVolume
  percentage: number;    // % of total profile volume
  nodeType: 'HVN' | 'LVN' | 'normal';
}

export interface VolumeProfile {
  symbol: string;
  timestamp: number;
  
  // Price range
  highPrice: number;
  lowPrice: number;
  
  // Key levels
  poc: number;           // Point of Control price
  vah: number;           // Value Area High
  val: number;           // Value Area Low
  
  // Volume stats
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  profileDelta: number;  // Total buy - sell
  
  // Node array (sorted by price descending)
  nodes: VolumeNode[];
  
  // Significant levels
  hvnLevels: number[];   // High Volume Node prices
  lvnLevels: number[];   // Low Volume Node prices
}

export interface VolumeProfileConfig {
  // Number of price rows in profile
  rowCount: number;
  
  // Time window in milliseconds (0 = session)
  windowMs: number;
  
  // Value area percentage (typically 70%)
  valueAreaPercent: number;
  
  // Threshold for HVN classification (multiplier of average)
  hvnThreshold: number;
  
  // Threshold for LVN classification (fraction of average)
  lvnThreshold: number;
  
  // Minimum tick size for bucketing
  tickSize: number;
}

const DEFAULT_CONFIG: VolumeProfileConfig = {
  rowCount: 50,
  windowMs: 0,           // Session-based by default
  valueAreaPercent: 70,
  hvnThreshold: 1.5,     // 150% of average = HVN
  lvnThreshold: 0.3,     // 30% of average = LVN
  tickSize: 0.01,
};

interface TradeBucket {
  price: number;
  buyVolume: number;
  sellVolume: number;
  timestamp: number;
}

export class VolumeProfileCalculator {
  private config: VolumeProfileConfig;
  private buckets: Map<number, TradeBucket> = new Map();
  private trades: Array<{ price: number; volume: number; side: 'buy' | 'sell'; timestamp: number }> = [];
  
  private highPrice: number = 0;
  private lowPrice: number = Infinity;
  private totalVolume: number = 0;
  private totalBuyVolume: number = 0;
  private totalSellVolume: number = 0;
  
  constructor(config: Partial<VolumeProfileConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a trade to the volume profile
   */
  addTrade(price: number, volume: number, side: 'buy' | 'sell', timestamp: number = Date.now()): void {
    // Store trade for window-based calculations
    if (this.config.windowMs > 0) {
      this.trades.push({ price, volume, side, timestamp });
      this.pruneOldTrades(timestamp);
    }
    
    // Update price range
    if (price > this.highPrice) this.highPrice = price;
    if (price < this.lowPrice) this.lowPrice = price;
    
    // Round price to tick size
    const bucketPrice = this.roundToTick(price);
    
    // Get or create bucket
    let bucket = this.buckets.get(bucketPrice);
    if (!bucket) {
      bucket = { price: bucketPrice, buyVolume: 0, sellVolume: 0, timestamp };
      this.buckets.set(bucketPrice, bucket);
    }
    
    // Update bucket
    if (side === 'buy') {
      bucket.buyVolume += volume;
      this.totalBuyVolume += volume;
    } else {
      bucket.sellVolume += volume;
      this.totalSellVolume += volume;
    }
    bucket.timestamp = timestamp;
    this.totalVolume += volume;
  }

  /**
   * Calculate and return current volume profile
   */
  getProfile(symbol: string): VolumeProfile {
    const now = Date.now();
    
    // Handle window-based profile
    if (this.config.windowMs > 0) {
      return this.calculateWindowProfile(symbol, now);
    }
    
    // Session-based profile
    return this.calculateSessionProfile(symbol, now);
  }

  /**
   * Calculate profile from all session data
   */
  private calculateSessionProfile(symbol: string, timestamp: number): VolumeProfile {
    if (this.buckets.size === 0 || this.totalVolume === 0) {
      return this.emptyProfile(symbol, timestamp);
    }
    
    // Convert buckets to sorted array
    const bucketArray = Array.from(this.buckets.values())
      .sort((a, b) => b.price - a.price);
    
    // Calculate nodes
    const nodes = this.calculateNodes(bucketArray, this.totalVolume);
    
    // Find POC
    const poc = this.findPOC(nodes);
    
    // Calculate Value Area
    const { vah, val } = this.calculateValueArea(nodes, poc);
    
    // Find HVN and LVN levels
    const hvnLevels = nodes.filter(n => n.nodeType === 'HVN').map(n => n.price);
    const lvnLevels = nodes.filter(n => n.nodeType === 'LVN').map(n => n.price);
    
    return {
      symbol,
      timestamp,
      highPrice: this.highPrice,
      lowPrice: this.lowPrice,
      poc,
      vah,
      val,
      totalVolume: this.totalVolume,
      totalBuyVolume: this.totalBuyVolume,
      totalSellVolume: this.totalSellVolume,
      profileDelta: this.totalBuyVolume - this.totalSellVolume,
      nodes,
      hvnLevels,
      lvnLevels,
    };
  }

  /**
   * Calculate profile from rolling window
   */
  private calculateWindowProfile(symbol: string, timestamp: number): VolumeProfile {
    this.pruneOldTrades(timestamp);
    
    if (this.trades.length === 0) {
      return this.emptyProfile(symbol, timestamp);
    }
    
    // Rebuild buckets from window trades
    const windowBuckets = new Map<number, TradeBucket>();
    let windowHigh = 0;
    let windowLow = Infinity;
    let windowTotal = 0;
    let windowBuy = 0;
    let windowSell = 0;
    
    for (const trade of this.trades) {
      const bucketPrice = this.roundToTick(trade.price);
      
      if (trade.price > windowHigh) windowHigh = trade.price;
      if (trade.price < windowLow) windowLow = trade.price;
      
      let bucket = windowBuckets.get(bucketPrice);
      if (!bucket) {
        bucket = { price: bucketPrice, buyVolume: 0, sellVolume: 0, timestamp: trade.timestamp };
        windowBuckets.set(bucketPrice, bucket);
      }
      
      if (trade.side === 'buy') {
        bucket.buyVolume += trade.volume;
        windowBuy += trade.volume;
      } else {
        bucket.sellVolume += trade.volume;
        windowSell += trade.volume;
      }
      windowTotal += trade.volume;
    }
    
    // Convert to sorted array
    const bucketArray = Array.from(windowBuckets.values())
      .sort((a, b) => b.price - a.price);
    
    const nodes = this.calculateNodes(bucketArray, windowTotal);
    const poc = this.findPOC(nodes);
    const { vah, val } = this.calculateValueArea(nodes, poc);
    
    const hvnLevels = nodes.filter(n => n.nodeType === 'HVN').map(n => n.price);
    const lvnLevels = nodes.filter(n => n.nodeType === 'LVN').map(n => n.price);
    
    return {
      symbol,
      timestamp,
      highPrice: windowHigh,
      lowPrice: windowLow,
      poc,
      vah,
      val,
      totalVolume: windowTotal,
      totalBuyVolume: windowBuy,
      totalSellVolume: windowSell,
      profileDelta: windowBuy - windowSell,
      nodes,
      hvnLevels,
      lvnLevels,
    };
  }

  /**
   * Convert buckets to VolumeNode array with classifications
   */
  private calculateNodes(buckets: TradeBucket[], totalVolume: number): VolumeNode[] {
    if (buckets.length === 0) return [];
    
    const avgVolume = totalVolume / buckets.length;
    
    return buckets.map(bucket => {
      const nodeVolume = bucket.buyVolume + bucket.sellVolume;
      const percentage = totalVolume > 0 ? (nodeVolume / totalVolume) * 100 : 0;
      
      let nodeType: 'HVN' | 'LVN' | 'normal' = 'normal';
      if (nodeVolume >= avgVolume * this.config.hvnThreshold) {
        nodeType = 'HVN';
      } else if (nodeVolume <= avgVolume * this.config.lvnThreshold) {
        nodeType = 'LVN';
      }
      
      return {
        price: bucket.price,
        totalVolume: nodeVolume,
        buyVolume: bucket.buyVolume,
        sellVolume: bucket.sellVolume,
        delta: bucket.buyVolume - bucket.sellVolume,
        percentage,
        nodeType,
      };
    });
  }

  /**
   * Find Point of Control (highest volume level)
   */
  private findPOC(nodes: VolumeNode[]): number {
    if (nodes.length === 0) return 0;
    
    let maxVolume = 0;
    let pocPrice = nodes[0].price;
    
    for (const node of nodes) {
      if (node.totalVolume > maxVolume) {
        maxVolume = node.totalVolume;
        pocPrice = node.price;
      }
    }
    
    return pocPrice;
  }

  /**
   * Calculate Value Area (VAH and VAL)
   * Uses the standard method: start at POC, expand alternating up/down
   * until valueAreaPercent of volume is captured
   */
  private calculateValueArea(nodes: VolumeNode[], poc: number): { vah: number; val: number } {
    if (nodes.length === 0) return { vah: poc, val: poc };
    
    const targetVolume = this.totalVolume * (this.config.valueAreaPercent / 100);
    
    // Find POC index
    const pocIndex = nodes.findIndex(n => n.price === poc);
    if (pocIndex === -1) return { vah: poc, val: poc };
    
    let capturedVolume = nodes[pocIndex].totalVolume;
    let upperIndex = pocIndex;
    let lowerIndex = pocIndex;
    
    // Expand until we capture enough volume
    while (capturedVolume < targetVolume && (upperIndex > 0 || lowerIndex < nodes.length - 1)) {
      const upperVol = upperIndex > 0 ? nodes[upperIndex - 1].totalVolume : 0;
      const lowerVol = lowerIndex < nodes.length - 1 ? nodes[lowerIndex + 1].totalVolume : 0;
      
      if (upperVol >= lowerVol && upperIndex > 0) {
        upperIndex--;
        capturedVolume += nodes[upperIndex].totalVolume;
      } else if (lowerIndex < nodes.length - 1) {
        lowerIndex++;
        capturedVolume += nodes[lowerIndex].totalVolume;
      } else if (upperIndex > 0) {
        upperIndex--;
        capturedVolume += nodes[upperIndex].totalVolume;
      } else {
        break;
      }
    }
    
    // Nodes are sorted descending, so upper index has higher price
    return {
      vah: nodes[upperIndex].price,
      val: nodes[lowerIndex].price,
    };
  }

  /**
   * Round price to tick size
   */
  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  /**
   * Remove trades outside the time window
   */
  private pruneOldTrades(currentTime: number): void {
    if (this.config.windowMs === 0) return;
    
    const cutoff = currentTime - this.config.windowMs;
    this.trades = this.trades.filter(t => t.timestamp >= cutoff);
  }

  /**
   * Create empty profile
   */
  private emptyProfile(symbol: string, timestamp: number): VolumeProfile {
    return {
      symbol,
      timestamp,
      highPrice: 0,
      lowPrice: 0,
      poc: 0,
      vah: 0,
      val: 0,
      totalVolume: 0,
      totalBuyVolume: 0,
      totalSellVolume: 0,
      profileDelta: 0,
      nodes: [],
      hvnLevels: [],
      lvnLevels: [],
    };
  }

  /**
   * Get aggregated profile with reduced row count
   * Useful for rendering at different resolutions
   */
  getAggregatedProfile(symbol: string, targetRows: number): VolumeProfile {
    const fullProfile = this.getProfile(symbol);
    
    if (fullProfile.nodes.length <= targetRows) {
      return fullProfile;
    }
    
    // Aggregate nodes into fewer rows
    const rowSize = Math.ceil(fullProfile.nodes.length / targetRows);
    const aggregatedNodes: VolumeNode[] = [];
    
    for (let i = 0; i < fullProfile.nodes.length; i += rowSize) {
      const chunk = fullProfile.nodes.slice(i, i + rowSize);
      
      const totalVol = chunk.reduce((sum, n) => sum + n.totalVolume, 0);
      const buyVol = chunk.reduce((sum, n) => sum + n.buyVolume, 0);
      const sellVol = chunk.reduce((sum, n) => sum + n.sellVolume, 0);
      const avgPrice = chunk.reduce((sum, n) => sum + n.price, 0) / chunk.length;
      
      const avgVolume = fullProfile.totalVolume / targetRows;
      let nodeType: 'HVN' | 'LVN' | 'normal' = 'normal';
      if (totalVol >= avgVolume * this.config.hvnThreshold) {
        nodeType = 'HVN';
      } else if (totalVol <= avgVolume * this.config.lvnThreshold) {
        nodeType = 'LVN';
      }
      
      aggregatedNodes.push({
        price: avgPrice,
        totalVolume: totalVol,
        buyVolume: buyVol,
        sellVolume: sellVol,
        delta: buyVol - sellVol,
        percentage: fullProfile.totalVolume > 0 ? (totalVol / fullProfile.totalVolume) * 100 : 0,
        nodeType,
      });
    }
    
    return {
      ...fullProfile,
      nodes: aggregatedNodes,
      hvnLevels: aggregatedNodes.filter(n => n.nodeType === 'HVN').map(n => n.price),
      lvnLevels: aggregatedNodes.filter(n => n.nodeType === 'LVN').map(n => n.price),
    };
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.buckets.clear();
    this.trades = [];
    this.highPrice = 0;
    this.lowPrice = Infinity;
    this.totalVolume = 0;
    this.totalBuyVolume = 0;
    this.totalSellVolume = 0;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<VolumeProfileConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config
   */
  getConfig(): VolumeProfileConfig {
    return { ...this.config };
  }

  /**
   * Get stats
   */
  getStats(): { bucketCount: number; tradeCount: number; totalVolume: number } {
    return {
      bucketCount: this.buckets.size,
      tradeCount: this.trades.length,
      totalVolume: this.totalVolume,
    };
  }
}
