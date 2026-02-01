// Global Recording State - wired to live market data

import { create } from 'zustand';
import { SessionRecorder } from '../data/SessionRecorder';
import { subscribeToTrades, getCurrentOrderBook } from '../services/dataBuffer';
import type { RecordedSession } from '../data/types';

interface RecordingState {
  isRecording: boolean;
  activeSymbol: string | null;
  sessions: RecordedSession[];

  // Current recording stats
  tradeCount: number;
  snapshotCount: number;
  duration: number;

  // Actions
  startRecording: (symbol: string) => void;
  stopRecording: () => RecordedSession | null;
  deleteSession: (sessionId: string) => void;
  clearSessions: () => void;
  getSession: (sessionId: string) => RecordedSession | undefined;
}

// Module-level recorder instance
let recorder: SessionRecorder | null = null;
let unsubscribe: (() => void) | null = null;
let orderBookInterval: ReturnType<typeof setInterval> | null = null;
let statsInterval: ReturnType<typeof setInterval> | null = null;

export const useRecordingStore = create<RecordingState>((set, get) => ({
  isRecording: false,
  activeSymbol: null,
  sessions: [],
  tradeCount: 0,
  snapshotCount: 0,
  duration: 0,

  startRecording: (symbol: string) => {
    // Clean up any existing recording
    if (recorder) {
      recorder.stop();
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (orderBookInterval) {
      clearInterval(orderBookInterval);
      orderBookInterval = null;
    }
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }

    // Create new recorder
    recorder = new SessionRecorder(symbol);
    recorder.start();

    // Subscribe to trade stream
    unsubscribe = subscribeToTrades((trade) => {
      if (!recorder || trade.symbol.toUpperCase() !== symbol.toUpperCase()) return;
      recorder.recordTrade(trade);
    });

    // Periodically capture order book snapshots
    orderBookInterval = setInterval(() => {
      if (!recorder) return;
      const orderBook = getCurrentOrderBook(symbol);
      if (orderBook) {
        recorder.recordOrderBook(orderBook);
      }
    }, 500); // Match SessionRecorder's OB_SNAPSHOT_INTERVAL_MS

    // Track last stats to avoid unnecessary state updates
    let lastStats = { tradeCount: 0, snapshotCount: 0, duration: 0 };

    // Update stats periodically - only when values actually change
    // Reduced to 500ms (2Hz) since humans can't perceive 10Hz updates anyway
    statsInterval = setInterval(() => {
      if (!recorder) return;
      const stats = recorder.getStats();

      // Only update if values actually changed
      if (stats.tradeCount !== lastStats.tradeCount ||
          stats.snapshotCount !== lastStats.snapshotCount ||
          stats.duration !== lastStats.duration) {
        lastStats = { ...stats };
        set({
          tradeCount: stats.tradeCount,
          snapshotCount: stats.snapshotCount,
          duration: stats.duration,
        });
      }
    }, 500);

    set({
      isRecording: true,
      activeSymbol: symbol,
      tradeCount: 0,
      snapshotCount: 0,
      duration: 0,
    });
  },

  stopRecording: () => {
    if (!recorder) return null;

    // Stop and get session
    recorder.stop();
    const session = recorder.getSession();

    // Cleanup
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (orderBookInterval) {
      clearInterval(orderBookInterval);
      orderBookInterval = null;
    }
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }

    recorder = null;

    // Only save sessions with trades
    if (session.trades.length > 0) {
      set((state) => ({
        isRecording: false,
        activeSymbol: null,
        sessions: [...state.sessions, session],
      }));
      return session;
    }

    set({
      isRecording: false,
      activeSymbol: null,
    });
    return null;
  },

  deleteSession: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    }));
  },

  clearSessions: () => {
    set({ sessions: [] });
  },

  getSession: (sessionId: string) => {
    return get().sessions.find((s) => s.id === sessionId);
  },
}));

// Export helper to check if currently recording
export function isCurrentlyRecording(): boolean {
  return recorder !== null && recorder.isActive();
}
