// Global 60fps clock - single RAF loop shared by all components that need time updates

type ClockListener = (timestamp: number) => void;

class GlobalClockService {
  private listeners: Set<ClockListener> = new Set();
  private animationFrameId: number | null = null;
  private currentTime: number = Date.now();
  private isRunning: boolean = false;
  
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick();
  }
  
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Main loop - runs every animation frame
   */
  private tick = (): void => {
    if (!this.isRunning) return;
    
    this.currentTime = Date.now();
    
    // Notify all subscribers
    for (const listener of this.listeners) {
      try {
        listener(this.currentTime);
      } catch (e) {
        console.error('Clock listener error:', e);
      }
    }
    
    this.animationFrameId = requestAnimationFrame(this.tick);
  };
  
  /**
   * Subscribe to clock updates
   * Returns unsubscribe function for cleanup
   */
  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    
    // Start ticking if this is the first subscriber
    if (this.listeners.size === 1) {
      this.start();
    }
    
    return () => {
      this.listeners.delete(listener);
      
      // Stop if no more subscribers
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }
  
  /**
   * Get current time without subscribing
   */
  now(): number {
    return this.currentTime || Date.now();
  }
  
  /**
   * Format timestamp with millisecond precision
   */
  formatTime(timestamp?: number): { hours: string; minutes: string; seconds: string; milliseconds: string; full: string } {
    const time = timestamp ?? this.currentTime;
    const date = new Date(time);
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    
    return {
      hours,
      minutes,
      seconds,
      milliseconds,
      full: `${hours}:${minutes}:${seconds}.${milliseconds}`
    };
  }
  
  /**
   * Get human-readable "time ago" string
   */
  getTimeAgo(timestamp: number): string {
    const diff = this.currentTime - timestamp;
    if (diff < 0) return 'future';
    if (diff < 1000) return `${diff}ms`;
    if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    return `${Math.floor(diff / 3600000)}h`;
  }
}

// Singleton - share one clock across the whole app
export const globalClock = new GlobalClockService();

// ============================================================================
// React Hooks
// ============================================================================

import { useState, useEffect, useRef } from 'react';

/**
 * Hook to get current time with optional throttling
 */
export function useGlobalClock(throttleMs: number = 0): number {
  const [time, setTime] = useState(globalClock.now());
  const lastUpdateRef = useRef(0);
  
  useEffect(() => {
    const unsubscribe = globalClock.subscribe((timestamp) => {
      if (throttleMs > 0) {
        if (timestamp - lastUpdateRef.current < throttleMs) return;
        lastUpdateRef.current = timestamp;
      }
      setTime(timestamp);
    });
    
    return unsubscribe;
  }, [throttleMs]);
  
  return time;
}

/**
 * Hook that returns formatted time parts
 */
export function useFormattedTime(): { hours: string; minutes: string; seconds: string; milliseconds: string; full: string } {
  const [formatted, setFormatted] = useState(globalClock.formatTime());
  
  useEffect(() => {
    const unsubscribe = globalClock.subscribe((timestamp) => {
      setFormatted(globalClock.formatTime(timestamp));
    });
    
    return unsubscribe;
  }, []);
  
  return formatted;
}

/**
 * Hook for direct DOM updates - bypasses React for max performance
 * 
 * Use this when you need to update text content at 60fps without
 * React overhead. Pass a ref to the element you want to update.
 */
export function useDirectDOMClock(elementRef: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    if (!elementRef.current) return;
    
    const unsubscribe = globalClock.subscribe((timestamp) => {
      if (elementRef.current) {
        const { full } = globalClock.formatTime(timestamp);
        elementRef.current.textContent = full;
      }
    });
    
    return unsubscribe;
  }, [elementRef]);
}
