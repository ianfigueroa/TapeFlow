import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData, LiquidityZone } from '../types';

export class IndicatorLayer implements Layer {
  readonly id = 'indicators';

  private vwap: number = 0;
  private poc: number | undefined;
  private liquidityZones: LiquidityZone[] = [];
  private showVwap: boolean = true;
  private showPoc: boolean = true;
  private showLiquidityZones: boolean = true;

  update(data: EngineData): void {
    this.vwap = data.vwap;
    this.poc = data.poc;
    this.liquidityZones = data.liquidityZones;
  }

  render(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
    const { width, theme } = rc;

    if (this.showLiquidityZones) {
      this.renderLiquidityZones(ctx, rc);
    }

    if (this.showVwap && this.vwap > 0 && rc.priceRange > 0) {
      const vwapY = rc.priceToY(this.vwap);
      ctx.strokeStyle = theme.vwap;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, vwapY);
      ctx.lineTo(width, vwapY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = theme.background;
      ctx.fillRect(width - 70, vwapY - 8, 68, 16);
      ctx.fillStyle = theme.vwap;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`VWAP ${this.vwap.toFixed(2)}`, width - 4, vwapY + 4);
    }

    if (this.showPoc && this.poc !== undefined && rc.priceRange > 0) {
      const pocY = rc.priceToY(this.poc);
      ctx.strokeStyle = theme.poc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, pocY);
      ctx.lineTo(width, pocY);
      ctx.stroke();

      ctx.fillStyle = theme.background;
      ctx.fillRect(width - 70, pocY - 8, 68, 16);
      ctx.fillStyle = theme.poc;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`POC ${this.poc.toFixed(2)}`, width - 4, pocY + 4);
    }
  }

  private renderLiquidityZones(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
    const { width, theme } = rc;

    for (const zone of this.liquidityZones) {
      if (!zone.active) continue;

      const y = rc.priceToY(zone.price);
      const age = (Date.now() - zone.firstSeen) / 1000;
      const opacity = Math.min(0.6, 0.2 + age / 600);

      ctx.strokeStyle = zone.side === 'bid' ? theme.bidZone : theme.askZone;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  setShowVwap(show: boolean): void {
    this.showVwap = show;
  }

  setShowPoc(show: boolean): void {
    this.showPoc = show;
  }

  setShowLiquidityZones(show: boolean): void {
    this.showLiquidityZones = show;
  }

  dispose(): void {
    this.liquidityZones = [];
  }
}
