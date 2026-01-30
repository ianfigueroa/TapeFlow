import type { Layer } from './Layer';
import type { EngineData, ThemeColors } from './types';
import { RenderContext } from './RenderContext';

interface LayerRegistration {
  id: string;
  layer: Layer;
  zIndex: number;
  visible: boolean;
}

export class LayerManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layers: Map<string, LayerRegistration> = new Map();
  private sortedLayers: LayerRegistration[] = [];
  private rafId: number | null = null;
  private renderContext: RenderContext;
  private pendingData: EngineData | null = null;
  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement, theme?: Partial<ThemeColors>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.renderContext = new RenderContext(canvas.width, canvas.height, theme);
    this.setupCanvas();
  }

  private setupCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.renderContext.resize(rect.width, rect.height);
  }

  registerLayer(id: string, layer: Layer, zIndex: number): void {
    if (this.layers.has(id)) {
      this.unregisterLayer(id);
    }
    this.layers.set(id, { id, layer, zIndex, visible: true });
    this.rebuildSortedLayers();
  }

  unregisterLayer(id: string): void {
    const reg = this.layers.get(id);
    if (reg) {
      reg.layer.dispose();
      this.layers.delete(id);
      this.rebuildSortedLayers();
    }
  }

  setLayerVisibility(id: string, visible: boolean): void {
    const reg = this.layers.get(id);
    if (reg) reg.visible = visible;
  }

  getLayer<T extends Layer>(id: string): T | null {
    const reg = this.layers.get(id);
    return reg ? (reg.layer as T) : null;
  }

  private rebuildSortedLayers(): void {
    this.sortedLayers = Array.from(this.layers.values())
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (): void => {
    if (!this.isRunning) return;
    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const { ctx, renderContext } = this;
    const { width, height } = renderContext;

    ctx.clearRect(0, 0, width, height);

    for (const { layer, visible } of this.sortedLayers) {
      if (!visible) continue;
      ctx.save();
      layer.render(ctx, renderContext);
      ctx.restore();
    }
  }

  updateData(data: EngineData): void {
    this.pendingData = data;
    for (const { layer } of this.sortedLayers) {
      layer.update(data);
    }
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.renderContext.resize(width, height);
  }

  setViewport(priceMin: number, priceMax: number, timeStart: number, timeEnd: number): void {
    this.renderContext.setViewport({ priceMin, priceMax, timeStart, timeEnd });
  }

  getRenderContext(): RenderContext {
    return this.renderContext;
  }

  dispose(): void {
    this.stop();
    for (const { layer } of this.sortedLayers) {
      layer.dispose();
    }
    this.layers.clear();
    this.sortedLayers = [];
  }
}
