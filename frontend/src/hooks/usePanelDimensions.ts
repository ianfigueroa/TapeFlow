// Hook for tracking panel dimensions via ResizeObserver
// Used by GridPanel to provide dimensions to child components

import { useRef, useState, useEffect, useCallback } from 'react';
import type { PanelDimensions } from '../types/layout';

/**
 * Custom hook that tracks element dimensions using ResizeObserver
 * with debouncing to prevent excessive re-renders during resize operations.
 *
 * @param debounceMs - Debounce delay in milliseconds (default: 100ms)
 * @returns Object containing ref to attach to element and current dimensions
 */
export function usePanelDimensions(debounceMs = 100): {
  ref: React.RefObject<HTMLDivElement>;
  dimensions: PanelDimensions;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<PanelDimensions>({
    width: 0,
    height: 0,
  });

  // Track pending dimensions during debounce
  const pendingDimensionsRef = useRef<PanelDimensions | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced dimension update
  const updateDimensions = useCallback(
    (newDimensions: PanelDimensions) => {
      pendingDimensionsRef.current = newDimensions;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        if (pendingDimensionsRef.current) {
          setDimensions(pendingDimensionsRef.current);
          pendingDimensionsRef.current = null;
        }
      }, debounceMs);
    },
    [debounceMs]
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      updateDimensions({ width, height });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [updateDimensions]);

  return { ref, dimensions };
}
