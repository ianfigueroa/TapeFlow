import type { Layer } from '../Layer';
import type { RenderContext } from '../RenderContext';
import type { EngineData } from '../types';

export class BackgroundLayer implements Layer {
  readonly id = 'background';

  private gridLines: number = 8;
  private showGrid: boolean = true;

  update(_data: EngineData): void {}

  render(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
    const { width, height, theme } = rc;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    if (!this.showGrid) return;

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;

    const hStep = height / this.gridLines;
    for (let i = 1; i < this.gridLines; i++) {
      const y = Math.round(i * hStep) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const vStep = width / this.gridLines;
    for (let i = 1; i < this.gridLines; i++) {
      const x = Math.round(i * vStep) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  setGridLines(count: number): void {
    this.gridLines = count;
  }

  setShowGrid(show: boolean): void {
    this.showGrid = show;
  }

  dispose(): void {}
}
