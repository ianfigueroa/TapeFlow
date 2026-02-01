import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData } from '../types';

export class OverlayLayer implements Layer {
  readonly id = 'overlay';

  private mouseX: number = -1;
  private mouseY: number = -1;
  private showCrosshair: boolean = false;
  private currentPrice: number = 0;
  private currentTime: number = 0;

  update(data: EngineData): void {
    if (data.trades.length > 0) {
      this.currentPrice = data.trades[0].price;
      this.currentTime = data.trades[0].timestamp;
    }
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  render(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
    if (!this.showCrosshair || this.mouseX < 0 || this.mouseY < 0) return;

    const { width, height, theme } = rc;

    ctx.strokeStyle = theme.textMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    ctx.beginPath();
    ctx.moveTo(this.mouseX, 0);
    ctx.lineTo(this.mouseX, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, this.mouseY);
    ctx.lineTo(width, this.mouseY);
    ctx.stroke();

    ctx.setLineDash([]);

    const price = rc.yToPrice(this.mouseY);
    const time = rc.xToTime(this.mouseX);

    ctx.fillStyle = theme.background;
    ctx.fillRect(this.mouseX + 8, this.mouseY - 20, 80, 36);
    ctx.strokeStyle = theme.grid;
    ctx.strokeRect(this.mouseX + 8, this.mouseY - 20, 80, 36);

    ctx.fillStyle = theme.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`$${price.toFixed(2)}`, this.mouseX + 12, this.mouseY - 6);

    const date = new Date(time);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(timeStr, this.mouseX + 12, this.mouseY + 8);
  }

  setMousePosition(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  setShowCrosshair(show: boolean): void {
    this.showCrosshair = show;
  }

  dispose(): void {}
}
