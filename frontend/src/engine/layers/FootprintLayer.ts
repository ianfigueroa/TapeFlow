import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData, FootprintCluster } from '../types';

const MAX_CLUSTERS = 60;
const DEFAULT_INTERVAL_MS = 15000; // Changed to 15 seconds for better granularity

export class FootprintLayer implements Layer {
  readonly id = 'footprint';

  private clusters: FootprintCluster[] = [];
  private currentCluster: FootprintCluster | null = null;
  private clusterIntervalMs: number = DEFAULT_INTERVAL_MS;
  private tickSize: number = 10; // Default tick size for BTC
  private maxVolume: number = 1;
  private showLabels: boolean = true;
  
  // Track global max volume for consistent heatmap scaling
  private globalMaxVolume: number = 1;
  
  // Batch processing - accumulate trades before processing
  private pendingTrades: { timestamp: number; price: number; volume: number; side: string }[] = [];
  private lastProcessTime: number = 0;
  private processIntervalMs: number = 50; // Process every 50ms

  update(data: EngineData): void {
    // Queue all trades for batch processing
    for (const trade of data.trades) {
      this.pendingTrades.push({
        timestamp: trade.timestamp,
        price: trade.price,
        volume: trade.volume,
        side: trade.side,
      });
    }
    
    // Process pending trades in batches
    const now = Date.now();
    if (now - this.lastProcessTime >= this.processIntervalMs) {
      this.processPendingTrades();
      this.lastProcessTime = now;
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

    // Track max volume for heatmap scaling
    const levelTotal = level.bid + level.ask;
    if (levelTotal > this.maxVolume) {
      this.maxVolume = levelTotal;
    }
    if (levelTotal > this.globalMaxVolume) {
      this.globalMaxVolume = levelTotal;
    }
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

    const padding = (priceMax - priceMin) * 0.1 || 10;
    priceMin -= padding;
    priceMax += padding;

    rc.setViewport({ priceMin, priceMax, timeStart, timeEnd });

    const candleWidth = Math.max(20, width / allClusters.length - 2);
    const halfCandle = candleWidth / 2;

    for (let i = 0; i < allClusters.length; i++) {
      const cluster = allClusters[i];
      const centerX = rc.timeToX(cluster.timestamp + this.clusterIntervalMs / 2);

      this.renderCluster(ctx, rc, cluster, centerX, halfCandle, theme);
    }
  }

  private renderCluster(
    ctx: CanvasRenderingContext2D,
    rc: RenderContext,
    cluster: FootprintCluster,
    centerX: number,
    halfWidth: number,
    theme: any
  ): void {
    const rowHeight = Math.max(14, rc.height / 25);
    
    // Use global max volume for consistent heatmap coloring across all clusters
    const maxVol = Math.max(this.globalMaxVolume, this.maxVolume, 1);

    for (const [price, volumes] of cluster.priceLevels) {
      const y = rc.priceToY(price);
      const isPoc = price === cluster.poc;
      const totalVolume = volumes.bid + volumes.ask;
      
      // Calculate heatmap intensity (0-1)
      const intensity = Math.min(totalVolume / maxVol, 1);
      
      // Dynamic bar widths based on volume
      const bidWidth = maxVol > 0 ? (volumes.bid / maxVol) * halfWidth : 0;
      const askWidth = maxVol > 0 ? (volumes.ask / maxVol) * halfWidth : 0;

      // --- HEATMAP BACKGROUND ---
      // Background color intensity based on total volume at this level
      const bgAlpha = 0.1 + intensity * 0.4; // Range: 0.1 to 0.5
      
      // Determine dominant side for background tint
      const delta = volumes.ask - volumes.bid;
      if (Math.abs(delta) > 0.001) {
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
        // Show labels for significant volume nodes (>10% of max)
        if (totalVolume > maxVol * 0.1 || isPoc) {
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Text shadow for better readability
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          const bidStr = this.formatVolume(volumes.bid);
          const askStr = this.formatVolume(volumes.ask);
          const label = `${bidStr}×${askStr}`;
          
          ctx.fillText(label, centerX + 1, y + 1);
          ctx.fillStyle = isPoc ? '#FFD700' : theme.text || '#FFFFFF';
          ctx.fillText(label, centerX, y);
          
          // Imbalance indicator
          const imbalanceRatio = totalVolume > 0 ? Math.abs(delta) / totalVolume : 0;
          if (imbalanceRatio > 0.6) {
            // Strong imbalance - show arrow indicator
            const arrow = delta > 0 ? '▲' : '▼';
            const arrowColor = delta > 0 ? '#00FF41' : '#FF4545';
            ctx.fillStyle = arrowColor;
            ctx.font = 'bold 8px monospace';
            ctx.fillText(arrow, centerX + halfWidth - 8, y);
          }
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

  setClusterInterval(ms: number): void {
    this.clusterIntervalMs = ms;
    this.clear();
  }

  setTickSize(size: number): void {
    this.tickSize = size;
  }

  setShowLabels(show: boolean): void {
    this.showLabels = show;
  }

  clear(): void {
    this.clusters = [];
    this.currentCluster = null;
    this.maxVolume = 1;
    this.globalMaxVolume = 1;
    this.pendingTrades = [];
  }

  dispose(): void {
    this.clear();
  }
  
  // Force process any pending trades (call before render if needed)
  flush(): void {
    this.processPendingTrades();
  }
}
