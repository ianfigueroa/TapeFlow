import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData, FootprintCluster } from '../types';

const MAX_CLUSTERS = 60;
const DEFAULT_INTERVAL_MS = 60000;

export class FootprintLayer implements Layer {
  readonly id = 'footprint';

  private clusters: FootprintCluster[] = [];
  private currentCluster: FootprintCluster | null = null;
  private clusterIntervalMs: number = DEFAULT_INTERVAL_MS;
  private tickSize: number = 1;
  private maxVolume: number = 1;
  private showLabels: boolean = true;

  update(data: EngineData): void {
    for (const trade of data.trades) {
      this.addTrade(trade.timestamp, trade.price, trade.volume, trade.side);
    }
  }

  private addTrade(timestamp: number, price: number, volume: number, side: string): void {
    const clusterTime = Math.floor(timestamp / this.clusterIntervalMs) * this.clusterIntervalMs;

    if (!this.currentCluster || this.currentCluster.timestamp !== clusterTime) {
      if (this.currentCluster) {
        this.finalizePoc(this.currentCluster);
        this.clusters.push(this.currentCluster);
        if (this.clusters.length > MAX_CLUSTERS) this.clusters.shift();
      }
      this.currentCluster = this.createCluster(clusterTime, price);
    }

    const cluster = this.currentCluster;
    const priceLevel = this.roundToTick(price);

    let level = cluster.priceLevels.get(priceLevel);
    if (!level) {
      level = { bid: 0, ask: 0 };
      cluster.priceLevels.set(priceLevel, level);
    }

    if (side === 'buy') {
      level.ask += volume;
    } else {
      level.bid += volume;
    }

    cluster.high = Math.max(cluster.high, price);
    cluster.low = Math.min(cluster.low, price);
    cluster.close = price;
    cluster.totalVolume += volume;

    const levelTotal = level.bid + level.ask;
    if (levelTotal > this.maxVolume) {
      this.maxVolume = levelTotal;
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
    const rowHeight = Math.max(12, rc.height / 30);

    for (const [price, volumes] of cluster.priceLevels) {
      const y = rc.priceToY(price);
      const isPoc = price === cluster.poc;

      const bidWidth = this.maxVolume > 0 ? (volumes.bid / this.maxVolume) * halfWidth : 0;
      const askWidth = this.maxVolume > 0 ? (volumes.ask / this.maxVolume) * halfWidth : 0;

      ctx.fillStyle = theme.sell;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(centerX - bidWidth, y - rowHeight / 2, bidWidth, rowHeight);

      ctx.fillStyle = theme.buy;
      ctx.fillRect(centerX, y - rowHeight / 2, askWidth, rowHeight);

      ctx.globalAlpha = 1;

      if (isPoc) {
        ctx.strokeStyle = theme.poc;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          centerX - halfWidth,
          y - rowHeight / 2,
          halfWidth * 2,
          rowHeight
        );
      }

      if (this.showLabels && (volumes.bid > 0 || volumes.ask > 0)) {
        const total = volumes.bid + volumes.ask;
        if (total > this.maxVolume * 0.1) {
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = theme.text;

          const bidStr = this.formatVolume(volumes.bid);
          const askStr = this.formatVolume(volumes.ask);

          ctx.fillText(`${bidStr}x${askStr}`, centerX, y + 3);
        }
      }
    }

    const openY = rc.priceToY(cluster.open);
    const closeY = rc.priceToY(cluster.close);
    const highY = rc.priceToY(cluster.high);
    const lowY = rc.priceToY(cluster.low);

    const isUp = cluster.close >= cluster.open;
    ctx.strokeStyle = isUp ? theme.buy : theme.sell;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(centerX, highY);
    ctx.lineTo(centerX, lowY);
    ctx.stroke();

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.abs(closeY - openY) || 1;

    ctx.fillStyle = isUp ? theme.buy : theme.sell;
    ctx.fillRect(centerX - 2, bodyTop, 4, bodyHeight);
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
  }

  dispose(): void {
    this.clear();
  }
}
