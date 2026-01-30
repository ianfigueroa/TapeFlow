import type { Trade, OrderBook } from '../../types';
import type {
  DataSource,
  DataSourceCallbacks,
  DataSourceStatus,
  RecordedSession,
  PlaybackState,
} from '../types';

export class ReplaySource implements DataSource {
  readonly name = 'Replay';
  readonly type = 'replay' as const;

  private _status: DataSourceStatus = 'disconnected';
  private callbacks: DataSourceCallbacks | null = null;
  private session: RecordedSession | null = null;

  private playbackSpeed: number = 1;
  private isPlaying: boolean = false;
  private tradeIndex: number = 0;
  private obIndex: number = 0;
  private playbackTimeoutId: number | null = null;
  private startRealTime: number = 0;
  private startSessionTime: number = 0;

  get status(): DataSourceStatus {
    return this._status;
  }

  setCallbacks(callbacks: DataSourceCallbacks): void {
    this.callbacks = callbacks;
  }

  loadSession(session: RecordedSession): void {
    this.session = session;
    this.tradeIndex = 0;
    this.obIndex = 0;
    this.isPlaying = false;
    this._status = 'connected';
    this.callbacks?.onStatusChange(this._status);
  }

  async connect(): Promise<void> {
    if (!this.session) {
      throw new Error('No session loaded');
    }
    this._status = 'connected';
    this.callbacks?.onStatusChange(this._status);
  }

  disconnect(): void {
    this.pause();
    this._status = 'disconnected';
    this.callbacks?.onStatusChange(this._status);
  }

  subscribe(_symbol: string): void {}

  unsubscribe(_symbol: string): void {}

  getSubscribedSymbols(): string[] {
    return this.session ? [this.session.symbol] : [];
  }

  play(): void {
    if (!this.session || this.isPlaying) return;

    this.isPlaying = true;
    this.startRealTime = Date.now();
    this.startSessionTime = this.getCurrentSessionTime();
    this.scheduleNext();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.playbackTimeoutId !== null) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
  }

  stop(): void {
    this.pause();
    this.tradeIndex = 0;
    this.obIndex = 0;
  }

  setSpeed(speed: number): void {
    if (speed <= 0 || speed > 100) return;

    if (this.isPlaying) {
      this.pause();
      this.playbackSpeed = speed;
      this.play();
    } else {
      this.playbackSpeed = speed;
    }
  }

  seekTo(timestamp: number): void {
    if (!this.session) return;

    this.pause();

    this.tradeIndex = this.binarySearchTrade(timestamp);
    this.obIndex = this.binarySearchOB(timestamp);
  }

  seekToPercent(percent: number): void {
    if (!this.session) return;

    const { startTime, endTime } = this.session;
    const targetTime = startTime + (endTime - startTime) * (percent / 100);
    this.seekTo(targetTime);
  }

  getPlaybackState(): PlaybackState {
    if (!this.session) {
      return {
        isPlaying: false,
        speed: this.playbackSpeed,
        currentTime: 0,
        startTime: 0,
        endTime: 0,
        progress: 0,
      };
    }

    const currentTime = this.getCurrentSessionTime();
    const { startTime, endTime } = this.session;
    const progress = ((currentTime - startTime) / (endTime - startTime)) * 100;

    return {
      isPlaying: this.isPlaying,
      speed: this.playbackSpeed,
      currentTime,
      startTime,
      endTime,
      progress: Math.max(0, Math.min(100, progress)),
    };
  }

  private getCurrentSessionTime(): number {
    if (!this.session) return 0;

    if (this.tradeIndex >= this.session.trades.length) {
      return this.session.endTime;
    }

    return this.session.trades[this.tradeIndex]?.timestamp || this.session.startTime;
  }

  private scheduleNext(): void {
    if (!this.isPlaying || !this.session) return;

    const nextTrade = this.session.trades[this.tradeIndex];
    const nextOB = this.session.orderBookSnapshots[this.obIndex];

    if (!nextTrade && !nextOB) {
      this.isPlaying = false;
      return;
    }

    let nextTimestamp: number;
    let emitTrade = false;
    let emitOB = false;

    if (nextTrade && nextOB) {
      if (nextTrade.timestamp <= nextOB.timestamp) {
        nextTimestamp = nextTrade.timestamp;
        emitTrade = true;
      } else {
        nextTimestamp = nextOB.timestamp;
        emitOB = true;
      }
    } else if (nextTrade) {
      nextTimestamp = nextTrade.timestamp;
      emitTrade = true;
    } else {
      nextTimestamp = nextOB!.timestamp;
      emitOB = true;
    }

    const elapsedReal = Date.now() - this.startRealTime;
    const elapsedSession = elapsedReal * this.playbackSpeed;
    const targetSessionTime = this.startSessionTime + elapsedSession;
    const waitTime = (nextTimestamp - targetSessionTime) / this.playbackSpeed;

    const execute = () => {
      if (!this.isPlaying) return;

      if (emitTrade && this.callbacks) {
        this.callbacks.onTrade(nextTrade);
        this.tradeIndex++;
      }

      if (emitOB && this.callbacks) {
        this.callbacks.onOrderBook(nextOB.orderBook);
        this.obIndex++;
      }

      this.scheduleNext();
    };

    if (waitTime <= 0) {
      execute();
    } else {
      this.playbackTimeoutId = window.setTimeout(execute, Math.max(1, waitTime));
    }
  }

  private binarySearchTrade(timestamp: number): number {
    if (!this.session) return 0;

    const trades = this.session.trades;
    let left = 0;
    let right = trades.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (trades[mid].timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  private binarySearchOB(timestamp: number): number {
    if (!this.session) return 0;

    const snapshots = this.session.orderBookSnapshots;
    let left = 0;
    let right = snapshots.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (snapshots[mid].timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }
}
