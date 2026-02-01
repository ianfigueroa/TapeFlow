import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData, FootprintCluster } from '../types';

const MAX_CLUSTERS = 30; // Fewer clusters for better visibility
const DEFAULT_INTERVAL_MS = 15000; // 15 seconds for faster cluster formation

// Dynamic tick sizes based on asset price
const TICK_SIZE_PRESETS: { [key: string]: number } = {
  BTC: 10,
  ETH: 1,
  SOL: 0.1,
  DEFAULT_HIGH: 10,    // Price > 1000
  DEFAULT_MED: 0.1,    // Price 10-1000
  DEFAULT_LOW: 0.001,  // Price < 10
};

export class FootprintLayer implements Layer {
  readonly id = 'footprint';

  private clusters: FootprintCluster[] = [];
  private currentCluster: FootprintCluster | null = null;
  private clusterIntervalMs: number = DEFAULT_INTERVAL_MS;
  private tickSize: number = 10;
  private maxVolume: number = 1;
  private showLabels: boolean = true;
  private autoTickSize: boolean = true; // Auto-calculate tick size from price
  
  // Use recent max volume for heatmap (prevents washed out current activity)
  private recentMaxVolumes: number[] = [];
  private readonly MAX_RECENT_VOLUMES = 5;
  
  // Batch processing - accumulate trades before processing
  private pendingTrades: { timestamp: number; price: number; volume: number; side: string }[] = [];
  private lastProcessTime: number = 0;
  private processIntervalMs: number = 50; // Process every 50ms
  
  // Track last seen price for auto tick size
  private lastPrice: number = 0;

  update(data: EngineData): void {
    // Queue all trades for batch processing
    for (const trade of data.trades) {
      this.pendingTrades.push({
        timestamp: trade.timestamp,
        price: trade.price,
        volume: trade.volume,
        side: trade.side,
      });
      
      // Auto-adjust tick size based on price if enabled
      if (this.autoTickSize && trade.price > 0 && Math.abs(trade.price - this.lastPrice) > this.lastPrice * 0.1) {
        this.lastPrice = trade.price;
        this.calculateAutoTickSize(trade.price);
      }
    }
    
    // Process pending trades in batches
    const now = Date.now();
    if (now - this.lastProcessTime >= this.processIntervalMs) {
      this.processPendingTrades();
      this.lastProcessTime = now;
    }
  }
  
  private calculateAutoTickSize(price: number): void {
    if (price >= 10000) {
      this.tickSize = 10;      // BTC-like: $10 ticks
    } else if (price >= 1000) {
      this.tickSize = 5;       // ETH-like: $5 ticks  
    } else if (price >= 100) {
      this.tickSize = 1;       // $1 ticks
    } else if (price >= 10) {
      this.tickSize = 0.1;     // $0.10 ticks
    } else if (price >= 1) {
      this.tickSize = 0.01;    // $0.01 ticks
    } else {
      this.tickSize = 0.0001;  // Micro ticks for penny assets
    }
  }
  
  private processPendingTrades(): void {
    if (this.pendingTrades.length === 0) return;
    
    // Sort by timestamp to ensure proper ordering
    this.pendingTrades.sort((a, b) => a.timestamp - b.timestamp);
    
    // Process all pending trades
    for (const trade of this.pendingTrades) {
      this.addTrade(trade.timestamp, trade.price, trade.volume, trade.side);
    }
    
    // Clear pending trades
    this.pendingTrades = [];
  }

  private addTrade(timestamp: number, price: number, volume: number, side: string): void {
    const clusterTime = Math.floor(timestamp / this.clusterIntervalMs) * this.clusterIntervalMs;

    // Check if we need to create a new cluster or append to existing
    if (!this.currentCluster || this.currentCluster.timestamp !== clusterTime) {
      // Finalize and store current cluster before creating new one
      if (this.currentCluster) {
        this.finalizePoc(this.currentCluster);
        this.clusters.push(this.currentCluster);
        if (this.clusters.length > MAX_CLUSTERS) this.clusters.shift();
      }
      
      // Check if we already have a cluster for this time period (late-arriving trades)
      const existingIndex = this.clusters.findIndex(c => c.timestamp === clusterTime);
      if (existingIndex >= 0) {
        // Remove from array and use as current
        this.currentCluster = this.clusters.splice(existingIndex, 1)[0];
      } else {
        this.currentCluster = this.createCluster(clusterTime, price);
      }
    }

    const cluster = this.currentCluster;
    const priceLevel = this.roundToTick(price);

    let level = cluster.priceLevels.get(priceLevel);
    if (!level) {
      level = { bid: 0, ask: 0 };
      cluster.priceLevels.set(priceLevel, level);
    }

    // Buy trades lift the ask (market buy), sell trades hit the bid (market sell)
    if (side === 'buy') {
      level.ask += volume;
    } else {
      level.bid += volume;
    }

    // Update OHLC
    cluster.high = Math.max(cluster.high, price);
    cluster.low = Math.min(cluster.low, price);
    cluster.close = price;
    cluster.totalVolume += volume;

    // Track max volume for heatmap scaling using recent window
    const levelTotal = level.bid + level.ask;
    if (levelTotal > this.maxVolume) {
      this.maxVolume = levelTotal;
    }
    
    // Track recent max volumes for better heatmap scaling
    this.recentMaxVolumes.push(levelTotal);
    if (this.recentMaxVolumes.length > this.MAX_RECENT_VOLUMES * 10) {
      this.recentMaxVolumes = this.recentMaxVolumes.slice(-this.MAX_RECENT_VOLUMES * 5);
    }
  }
  
  private getRecentMaxVolume(): number {
    if (this.recentMaxVolumes.length === 0) return this.maxVolume;
    // Use 90th percentile of recent volumes for better dynamic range
    const sorted = [...this.recentMaxVolumes].sort((a, b) => b - a);
    const idx = Math.floor(sorted.length * 0.1); // Top 10%
    return sorted[idx] || this.maxVolume;
  }

  private createCluster(timestamp: number, price: number): FootprintCluster {
    return {
      timestamp,
      open: price,
      high: price,
      low: price,
      close: price,
      priceLevels: new Map(),
      poc: price,
      totalVolume: 0,
    };
  }

  private finalizePoc(cluster: FootprintCluster): void {
    let maxVol = 0;
    let pocPrice = cluster.close;

    for (const [price, vol] of cluster.priceLevels) {
      const total = vol.bid + vol.ask;
      if (total > maxVol) {
        maxVol = total;
        pocPrice = price;
      }
    }

    cluster.poc = pocPrice;
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  render(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
    const { width, height, theme } = rc;
    
    // Reserve space for Y-axis labels
    const yAxisWidth = 65; // Fixed width for price labels
    const chartLeft = yAxisWidth + 5;
    const chartWidth = width - chartLeft - 10;

    if (this.clusters.length === 0 && !this.currentCluster) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting trades...', width / 2, height / 2);
      return;
    }

    const allClusters = [...this.clusters];
    if (this.currentCluster) {
      this.finalizePoc(this.currentCluster);
      allClusters.push(this.currentCluster);
    }

    if (allClusters.length === 0) return;

    let priceMin = Infinity;
    let priceMax = -Infinity;
    let timeStart = allClusters[0].timestamp;
    let timeEnd = allClusters[allClusters.length - 1].timestamp + this.clusterIntervalMs;

    for (const cluster of allClusters) {
      priceMin = Math.min(priceMin, cluster.low);
      priceMax = Math.max(priceMax, cluster.high);
    }

    const padding = (priceMax - priceMin) * 0.15 || this.tickSize * 2;
    priceMin -= padding;
    priceMax += padding;

    rc.setViewport({ priceMin, priceMax, timeStart, timeEnd });

    // Calculate optimal candle width based on number of clusters
    // Good widths for readability
    const minCandleWidth = 70;
    const maxCandleWidth = 120;
    const idealWidth = Math.floor(chartWidth / Math.max(allClusters.length, 1));
    const candleWidth = Math.max(minCandleWidth, Math.min(idealWidth, maxCandleWidth));
    const halfCandle = candleWidth / 2;
    
    // Calculate starting X to center the visible clusters (offset by yAxisWidth)
    const totalClustersWidth = allClusters.length * candleWidth;
    const startX = chartLeft + Math.max(0, (chartWidth - totalClustersWidth) / 2);

    // Draw Y-axis price labels first
    this.renderYAxis(ctx, rc, yAxisWidth, height, priceMin, priceMax, theme);

    for (let i = 0; i < allClusters.length; i++) {
      const cluster = allClusters[i];
      // Use fixed positioning based on index for cleaner layout
      const centerX = startX + (i * candleWidth) + halfCandle;

      this.renderCluster(ctx, rc, cluster, centerX, halfCandle, theme, height);
    }
    
    // Draw color legend at the bottom
    this.renderLegend(ctx, width, height, theme);
  }
  
  private renderYAxis(
    ctx: CanvasRenderingContext2D,
    rc: RenderContext,
    axisWidth: number,
    height: number,
    priceMin: number,
    priceMax: number,
    theme: any
  ): void {
    const numLabels = Math.min(10, Math.floor(height / 30));
    const priceRange = priceMax - priceMin;
    const priceStep = priceRange / numLabels;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, axisWidth, height);
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisWidth, 0);
    ctx.lineTo(axisWidth, height);
    ctx.stroke();
    
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.textMuted || '#666';
    
    for (let i = 0; i <= numLabels; i++) {
      const price = priceMin + (priceStep * i);
      const y = rc.priceToY(price);
      
      if (y < 10 || y > height - 10) continue;
      
      // Draw horizontal grid line
      ctx.strokeStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(axisWidth, y);
      ctx.lineTo(axisWidth + 1000, y);
      ctx.stroke();
      
      // Format price based on magnitude
      let priceLabel: string;
      if (price >= 10000) {
        priceLabel = price.toFixed(0);
      } else if (price >= 100) {
        priceLabel = price.toFixed(1);
      } else if (price >= 1) {
        priceLabel = price.toFixed(2);
      } else {
        priceLabel = price.toFixed(4);
      }
      
      ctx.fillStyle = theme.textMuted || '#666';
      ctx.fillText(priceLabel, axisWidth - 4, y);
    }
  }
  
  private renderLegend(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    theme: any
  ): void {
    const legendY = height - 18;
    const legendHeight = 14;
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, legendY, width, legendHeight);
    
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    
    // Buy (green)
    ctx.fillStyle = '#00FF41';
    ctx.fillRect(10, legendY + 3, 10, 8);
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('BUY', 24, legendY + 7);
    
    // Sell (red)
    ctx.fillStyle = '#FF4545';
    ctx.fillRect(60, legendY + 3, 10, 8);
    ctx.fillStyle = '#888';
    ctx.fillText('SELL', 74, legendY + 7);
    
    // POC (gold)
    ctx.strokeStyle = theme.poc || '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(115, legendY + 3, 10, 8);
    ctx.fillStyle = '#888';
    ctx.fillText('POC', 129, legendY + 7);
    
    // Imbalance indicator
    ctx.fillStyle = '#00FF41';
    ctx.fillText('▲', 170, legendY + 7);
    ctx.fillStyle = '#FF4545';
    ctx.fillText('▼', 180, legendY + 7);
    ctx.fillStyle = '#888';
    ctx.fillText('IMBALANCE', 194, legendY + 7);
  }

  private renderCluster(
    ctx: CanvasRenderingContext2D,
    rc: RenderContext,
    cluster: FootprintCluster,
    centerX: number,
    halfWidth: number,
    theme: any,
    canvasHeight: number
  ): void {
    // Calculate adaptive row height based on price levels
    const numLevels = cluster.priceLevels.size;
    const minRowHeight = 18;  // Reasonable minimum
    const maxRowHeight = 28;  // Good max for readability
    const availableHeight = canvasHeight - 40; // Leave margin for labels
    const idealRowHeight = numLevels > 0 ? availableHeight / Math.max(numLevels, 8) : minRowHeight;
    const rowHeight = Math.max(minRowHeight, Math.min(idealRowHeight, maxRowHeight));
    
    // Use recent max volume for better dynamic range
    const maxVol = Math.max(this.getRecentMaxVolume(), 0.001);

    for (const [price, volumes] of cluster.priceLevels) {
      const y = rc.priceToY(price);
      const isPoc = price === cluster.poc;
      const totalVolume = volumes.bid + volumes.ask;
      
      // Skip if off-screen
      if (y < -rowHeight || y > canvasHeight + rowHeight) continue;
      
      // Calculate heatmap intensity (0-1) with sqrt for better visual distribution
      const rawIntensity = Math.min(totalVolume / maxVol, 1);
      const intensity = Math.sqrt(rawIntensity); // Sqrt makes low volumes more visible
      
      // Dynamic bar widths based on volume
      const bidWidth = maxVol > 0 ? (volumes.bid / maxVol) * halfWidth * 0.9 : 0;
      const askWidth = maxVol > 0 ? (volumes.ask / maxVol) * halfWidth * 0.9 : 0;

      // --- HEATMAP BACKGROUND ---
      // Background color intensity based on total volume at this level
      const bgAlpha = 0.15 + intensity * 0.35; // Range: 0.15 to 0.5
      
      // Determine dominant side for background tint
      const delta = volumes.ask - volumes.bid;
      if (Math.abs(delta) > totalVolume * 0.2) {
        const isBullish = delta > 0;
        ctx.fillStyle = isBullish 
          ? `rgba(0, 255, 65, ${bgAlpha})` 
          : `rgba(255, 69, 69, ${bgAlpha})`;
        ctx.fillRect(centerX - halfWidth, y - rowHeight / 2, halfWidth * 2, rowHeight);
      } else {
        // Neutral - gray background
        ctx.fillStyle = `rgba(128, 128, 128, ${bgAlpha * 0.5})`;
        ctx.fillRect(centerX - halfWidth, y - rowHeight / 2, halfWidth * 2, rowHeight);
      }

      // --- BID/ASK VOLUME BARS ---
      // Bid (sell) volume - left side, red
      if (bidWidth > 0) {
        const bidAlpha = 0.5 + (volumes.bid / maxVol) * 0.4;
        ctx.fillStyle = `rgba(255, 69, 69, ${bidAlpha})`;
        ctx.fillRect(centerX - bidWidth, y - rowHeight / 2 + 1, bidWidth, rowHeight - 2);
      }

      // Ask (buy) volume - right side, green
      if (askWidth > 0) {
        const askAlpha = 0.5 + (volumes.ask / maxVol) * 0.4;
        ctx.fillStyle = `rgba(0, 255, 65, ${askAlpha})`;
        ctx.fillRect(centerX, y - rowHeight / 2 + 1, askWidth, rowHeight - 2);
      }

      // --- POC HIGHLIGHT ---
      if (isPoc) {
        ctx.strokeStyle = theme.poc || '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          centerX - halfWidth + 1,
          y - rowHeight / 2 + 1,
          halfWidth * 2 - 2,
          rowHeight - 2
        );
      }

      // --- VOLUME LABELS ---
      if (this.showLabels && totalVolume > 0) {
        // Calculate if text will fit in the row
        const fontSize = Math.min(11, Math.max(8, rowHeight - 6));
        ctx.font = `bold ${fontSize}px monospace`;
        
        const bidStr = this.formatVolume(volumes.bid);
        const askStr = this.formatVolume(volumes.ask);
        const label = `${bidStr}×${askStr}`;
        const textWidth = ctx.measureText(label).width;
        
        // Show labels for any level with volume (no threshold)
        // Only hide if text won't fit AND it's not significant
        const fitsInRow = textWidth < halfWidth * 1.8;
        const isSignificant = totalVolume > maxVol * 0.05 || isPoc; // Lowered from 0.1 to 0.05
        
        if (fitsInRow && isSignificant) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Text shadow for better readability
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillText(label, centerX + 1, y + 1);
          ctx.fillStyle = isPoc ? '#FFD700' : theme.text || '#FFFFFF';
          ctx.fillText(label, centerX, y);
        } else if (isSignificant) {
          // For significant levels that don't fit, show condensed version
          const shortLabel = this.formatVolumeShort(totalVolume);
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillText(shortLabel, centerX + 1, y + 1);
          ctx.fillStyle = isPoc ? '#FFD700' : '#AAA';
          ctx.fillText(shortLabel, centerX, y);
        }
        
        // Imbalance indicator
        const imbalanceRatio = totalVolume > 0 ? Math.abs(delta) / totalVolume : 0;
        if (imbalanceRatio > 0.6) {
          // Strong imbalance - show arrow indicator
          const arrow = delta > 0 ? '▲' : '▼';
          const arrowColor = delta > 0 ? '#00FF41' : '#FF4545';
          ctx.fillStyle = arrowColor;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(arrow, centerX + halfWidth - 3, y);
        }
      }
    }

    // --- OHLC CANDLESTICK OVERLAY ---
    const openY = rc.priceToY(cluster.open);
    const closeY = rc.priceToY(cluster.close);
    const highY = rc.priceToY(cluster.high);
    const lowY = rc.priceToY(cluster.low);

    const isUp = cluster.close >= cluster.open;
    const candleColor = isUp ? (theme.buy || '#00FF41') : (theme.sell || '#FF4545');
    
    // Wick (high-low line)
    ctx.strokeStyle = candleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, highY);
    ctx.lineTo(centerX, lowY);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
    
    ctx.fillStyle = candleColor;
    ctx.fillRect(centerX - 3, bodyTop, 6, bodyHeight);
  }

  private formatVolume(vol: number): string {
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol.toFixed(1);
  }
  
  private formatVolumeShort(vol: number): string {
    if (vol >= 1000000) return (vol / 1000000).toFixed(0) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(0) + 'K';
    if (vol >= 100) return vol.toFixed(0);
    return vol.toFixed(1);
  }

  setClusterInterval(ms: number): void {
    this.clusterIntervalMs = ms;
    this.clear();
  }

  setTickSize(size: number): void {
    this.tickSize = size;
    this.autoTickSize = false; // Disable auto when manually set
  }
  
  setAutoTickSize(enabled: boolean): void {
    this.autoTickSize = enabled;
  }

  setShowLabels(show: boolean): void {
    this.showLabels = show;
  }

  clear(): void {
    this.clusters = [];
    this.currentCluster = null;
    this.maxVolume = 1;
    this.recentMaxVolumes = [];
    this.pendingTrades = [];
    this.lastPrice = 0;
  }

  dispose(): void {
    this.clear();
  }
  
  // Force process any pending trades (call before render if needed)
  flush(): void {
    this.processPendingTrades();
  }
}
