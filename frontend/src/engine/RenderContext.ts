import type { ThemeColors, Viewport } from './types';
import { DEFAULT_THEME } from './types';

export class RenderContext {
  width: number;
  height: number;
  priceMin: number = 0;
  priceMax: number = 0;
  timeStart: number = 0;
  timeEnd: number = 0;
  theme: ThemeColors;

  private dpr: number;

  constructor(width: number, height: number, theme?: Partial<ThemeColors>) {
    this.width = width;
    this.height = height;
    this.dpr = window.devicePixelRatio || 1;
    this.theme = { ...DEFAULT_THEME, ...theme };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.dpr = window.devicePixelRatio || 1;
  }

  setViewport(viewport: Partial<Viewport>): void {
    if (viewport.priceMin !== undefined) this.priceMin = viewport.priceMin;
    if (viewport.priceMax !== undefined) this.priceMax = viewport.priceMax;
    if (viewport.timeStart !== undefined) this.timeStart = viewport.timeStart;
    if (viewport.timeEnd !== undefined) this.timeEnd = viewport.timeEnd;
  }

  priceToY(price: number): number {
    if (this.priceMax === this.priceMin) return this.height / 2;
    const ratio = (price - this.priceMin) / (this.priceMax - this.priceMin);
    return this.height * (1 - ratio);
  }

  yToPrice(y: number): number {
    if (this.height === 0) return this.priceMin;
    const ratio = 1 - y / this.height;
    return this.priceMin + ratio * (this.priceMax - this.priceMin);
  }

  timeToX(timestamp: number): number {
    if (this.timeEnd === this.timeStart) return 0;
    const ratio = (timestamp - this.timeStart) / (this.timeEnd - this.timeStart);
    return this.width * ratio;
  }

  xToTime(x: number): number {
    if (this.width === 0) return this.timeStart;
    const ratio = x / this.width;
    return this.timeStart + ratio * (this.timeEnd - this.timeStart);
  }

  get devicePixelRatio(): number {
    return this.dpr;
  }

  get priceRange(): number {
    return this.priceMax - this.priceMin;
  }

  get timeRange(): number {
    return this.timeEnd - this.timeStart;
  }
}
