import type { RenderContext } from './RenderContext';
import type { EngineData } from './types';

export interface Layer {
  readonly id: string;
  update(data: EngineData): void;
  render(ctx: CanvasRenderingContext2D, rc: RenderContext): void;
  dispose(): void;
}

export const LAYER_Z = {
  BACKGROUND: 0,
  HEATMAP: 10,
  FOOTPRINT: 20,
  INDICATORS: 30,
  OVERLAY: 40,
} as const;

export type LayerZIndex = typeof LAYER_Z[keyof typeof LAYER_Z];
