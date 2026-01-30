import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData, OrderBookSnapshot } from '../types';

const MAX_SNAPSHOTS = 100;
const PRICE_LEVELS = 40;

export class HeatmapLayer implements Layer {
  readonly id = 'heatmap';

  private snapshots: OrderBookSnapshot[] = [];
  private maxLogSize: number = 1;
  private lastSnapshotTime: number = 0;
  private snapshotInterval: number = 100;

  update(data: EngineData): void {
    if (!data.orderBookSnapshot) return;

    const now = Date.now();
    if (now - this.lastSnapshotTime < this.snapshotInterval) return;
    this.lastSnapshotTime = now;

    this.snapshots.push(data.orderBookSnapshot);
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }

    this.recalculateMaxLogSize();
  }

  private recalculateMaxLogSize(): void {
    let max = 0;
    for (const snap of this.snapshots) {
      for (const level of [...snap.bids, ...snap.asks]) {
        const logSize = level.size > 0 ? Math.log10(level.size + 1) : 0;
        if (logSize > max) max = logSize;
      }
    }
    this.maxLogSize = this.maxLogSize * 0.99 + max * 0.01;
    if (this.maxLogSize < 0.1) this.maxLogSize = max || 1;
  }

  render(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
    const { width, height, theme } = rc;

    if (this.snapshots.length < 2) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Building heatmap...', width / 2, height / 2);
      return;
    }

    const labelWidth = 60;
    const chartWidth = width - labelWidth;
    const chartHeight = height - 20;

    const numTimeSlots = this.snapshots.length;
    const cellWidth = chartWidth / numTimeSlots;
    const cellHeight = chartHeight / PRICE_LEVELS;

    const latestSnapshot = this.snapshots[this.snapshots.length - 1];
    const priceLevels: number[] = [];

    const askPrices = latestSnapshot.asks.map(l => l.price).slice(0, PRICE_LEVELS / 2);
    askPrices.reverse();
    priceLevels.push(...askPrices);

    const bidPrices = latestSnapshot.bids.map(l => l.price).slice(0, PRICE_LEVELS / 2);
    priceLevels.push(...bidPrices);

    for (let t = 0; t < numTimeSlots; t++) {
      const snapshot = this.snapshots[t];
      const x = t * cellWidth;

      const priceToSize = new Map<number, number>();
      snapshot.bids.forEach(l => priceToSize.set(l.price, l.size));
      snapshot.asks.forEach(l => priceToSize.set(l.price, l.size));

      for (let p = 0; p < priceLevels.length; p++) {
        const price = priceLevels[p];
        const y = p * cellHeight;

        let size = priceToSize.get(price) || 0;
        if (size === 0) {
          const allPrices = Array.from(priceToSize.keys());
          if (allPrices.length > 0) {
            const closest = allPrices.reduce((prev, curr) =>
              Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
            );
            if (Math.abs(closest - price) / price < 0.001) {
              size = priceToSize.get(closest) || 0;
            }
          }
        }

        const logSize = size > 0 ? Math.log10(size + 1) : 0;
        const intensity = this.maxLogSize > 0 ? Math.min(logSize / this.maxLogSize, 1) : 0;

        ctx.fillStyle = this.intensityToColor(intensity, theme);
        ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
      }
    }

    const midIndex = PRICE_LEVELS / 2;
    const midY = midIndex * cellHeight;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(chartWidth, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    this.renderLabels(ctx, rc, priceLevels, chartWidth, cellHeight, numTimeSlots);
  }

  private renderLabels(
    ctx: CanvasRenderingContext2D,
    rc: RenderContext,
    priceLevels: number[],
    chartWidth: number,
    cellHeight: number,
    numTimeSlots: number
  ): void {
    const { height, theme } = rc;

    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    const labelIndices = [
      0,
      Math.floor(PRICE_LEVELS / 4),
      PRICE_LEVELS / 2,
      Math.floor(3 * PRICE_LEVELS / 4),
      PRICE_LEVELS - 1,
    ];

    for (const i of labelIndices) {
      if (priceLevels[i]) {
        const y = i * cellHeight + cellHeight / 2 + 3;
        const price = priceLevels[i];
        const isAsk = i < PRICE_LEVELS / 2;
        ctx.fillStyle = isAsk ? theme.sell : theme.buy;
        ctx.fillText(price.toFixed(2), chartWidth + 4, y);
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('MID', chartWidth + 4, (PRICE_LEVELS / 2) * cellHeight + 4);

    ctx.fillStyle = theme.textMuted;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    const snapshots = this.snapshots;
    if (snapshots.length > 0) {
      const cellWidth = chartWidth / numTimeSlots;
      const timeLabels = [0, Math.floor(numTimeSlots / 2), numTimeSlots - 1];

      for (const i of timeLabels) {
        if (snapshots[i]) {
          const x = i * cellWidth + cellWidth / 2;
          const elapsed = Math.round(
            (snapshots[numTimeSlots - 1].timestamp - snapshots[i].timestamp) / 1000
          );
          const label = elapsed === 0 ? 'NOW' : `-${elapsed}s`;
          ctx.fillText(label, x, height - 4);
        }
      }
    }
  }

  private intensityToColor(intensity: number, theme: any): string {
    const t = Math.max(0, Math.min(1, intensity));

    if (t < 0.01) return theme.heatmapEmpty;
    if (t < 0.25) return this.lerpColor(theme.heatmapEmpty, theme.heatmapLow, t / 0.25);
    if (t < 0.5) return this.lerpColor(theme.heatmapLow, theme.heatmapMedium, (t - 0.25) / 0.25);
    if (t < 0.75) return this.lerpColor(theme.heatmapMedium, theme.heatmapHigh, (t - 0.5) / 0.25);
    return this.lerpColor(theme.heatmapHigh, theme.heatmapMax, (t - 0.75) / 0.25);
  }

  private lerpColor(c1: string, c2: string, t: number): string {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);

    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  clear(): void {
    this.snapshots = [];
    this.maxLogSize = 1;
    this.lastSnapshotTime = 0;
  }

  dispose(): void {
    this.clear();
  }
}
