import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { LayerManager } from './LayerManager';
import type { Layer } from './Layer';
import type { EngineData, ThemeColors } from './types';

export interface CanvasEngineHandle {
  registerLayer: (id: string, layer: Layer, zIndex: number) => void;
  unregisterLayer: (id: string) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  updateData: (data: EngineData) => void;
  setViewport: (priceMin: number, priceMax: number, timeStart: number, timeEnd: number) => void;
  getLayer: <T extends Layer>(id: string) => T | null;
}

interface CanvasEngineProps {
  width: number;
  height: number;
  theme?: Partial<ThemeColors>;
  className?: string;
  onReady?: (handle: CanvasEngineHandle) => void;
}

export const CanvasEngine = forwardRef<CanvasEngineHandle, CanvasEngineProps>(
  function CanvasEngine({ width, height, theme, className, onReady }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<LayerManager | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const manager = new LayerManager(canvas, theme);
      managerRef.current = manager;
      manager.resize(width, height);
      manager.start();

      if (onReady) {
        onReady({
          registerLayer: (id, layer, zIndex) => manager.registerLayer(id, layer, zIndex),
          unregisterLayer: (id) => manager.unregisterLayer(id),
          setLayerVisibility: (id, visible) => manager.setLayerVisibility(id, visible),
          updateData: (data) => manager.updateData(data),
          setViewport: (pMin, pMax, tStart, tEnd) => manager.setViewport(pMin, pMax, tStart, tEnd),
          getLayer: <T extends Layer>(id: string) => manager.getLayer<T>(id),
        });
      }

      return () => {
        manager.dispose();
        managerRef.current = null;
      };
    }, [theme, onReady]);

    useEffect(() => {
      if (managerRef.current) {
        managerRef.current.resize(width, height);
      }
    }, [width, height]);

    const handle: CanvasEngineHandle = {
      registerLayer: useCallback((id, layer, zIndex) => {
        managerRef.current?.registerLayer(id, layer, zIndex);
      }, []),
      unregisterLayer: useCallback((id) => {
        managerRef.current?.unregisterLayer(id);
      }, []),
      setLayerVisibility: useCallback((id, visible) => {
        managerRef.current?.setLayerVisibility(id, visible);
      }, []),
      updateData: useCallback((data) => {
        managerRef.current?.updateData(data);
      }, []),
      setViewport: useCallback((pMin, pMax, tStart, tEnd) => {
        managerRef.current?.setViewport(pMin, pMax, tStart, tEnd);
      }, []),
      getLayer: useCallback(<T extends Layer>(id: string) => {
        return managerRef.current?.getLayer<T>(id) ?? null;
      }, []),
    };

    useImperativeHandle(ref, () => handle, [handle]);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ width, height }}
      />
    );
  }
);

export default CanvasEngine;
