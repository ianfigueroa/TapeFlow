import { useState, useEffect, useCallback, useRef } from 'react';
import { ReplaySource } from '../../data/sources/ReplaySource';
import { SessionRecorder } from '../../data/SessionRecorder';
import type { RecordedSession, PlaybackState } from '../../data/types';
import { cn } from '../../lib/utils';

interface ReplayControlsProps {
  symbol: string;
  onTradeData?: (trade: any) => void;
  onOrderBookData?: (orderBook: any) => void;
  className?: string;
}

const SPEED_OPTIONS = [1, 2, 5, 10, 25, 50, 100];

export function ReplayControls({
  symbol,
  onTradeData,
  onOrderBookData,
  className,
}: ReplayControlsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    speed: 1,
    currentTime: 0,
    startTime: 0,
    endTime: 0,
    progress: 0,
  });

  const replayRef = useRef<ReplaySource | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);

  useEffect(() => {
    const replay = new ReplaySource();
    replay.setCallbacks({
      onTrade: (trade) => onTradeData?.(trade),
      onOrderBook: (ob) => onOrderBookData?.(ob),
      onTicker: () => {},
      onError: (err) => console.error('Replay error:', err),
      onStatusChange: () => {},
    });
    replayRef.current = replay;

    return () => {
      replay.disconnect();
    };
  }, [onTradeData, onOrderBookData]);

  useEffect(() => {
    if (!replayRef.current) return;
    const interval = setInterval(() => {
      setPlaybackState(replayRef.current!.getPlaybackState());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleStartRecording = useCallback(() => {
    const recorder = new SessionRecorder(symbol);
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [symbol]);

  const handleStopRecording = useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    const session = recorderRef.current.getSession();
    recorderRef.current = null;
    setIsRecording(false);

    if (session && session.trades.length > 0) {
      setSessions((prev) => [...prev, session]);
    }
  }, []);

  const handleLoadSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || !replayRef.current) return;

    replayRef.current.loadSession(session);
    setSelectedSession(sessionId);
  }, [sessions]);

  const handlePlay = useCallback(() => {
    replayRef.current?.play();
  }, []);

  const handlePause = useCallback(() => {
    replayRef.current?.pause();
  }, []);

  const handleStop = useCallback(() => {
    replayRef.current?.stop();
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    replayRef.current?.setSpeed(speed);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = parseFloat(e.target.value);
    replayRef.current?.seekToPercent(percent);
  }, []);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('bg-black border border-gray-800 rounded p-3 font-mono text-xs', className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-orange-500 uppercase tracking-wider">Replay</span>
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          className={cn(
            'px-2 py-1 rounded text-xs',
            isRecording
              ? 'bg-[#FF4545] text-black'
              : 'bg-gray-900 text-gray-400 hover:text-white'
          )}
        >
          {isRecording ? 'STOP REC' : 'REC'}
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="mb-3">
          <label className="text-gray-600 text-xs block mb-1">Session</label>
          <select
            value={selectedSession || ''}
            onChange={(e) => handleLoadSession(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-xs focus:border-gray-700 outline-none"
          >
            <option value="">Select session...</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.symbol} - {new Date(s.startTime).toLocaleTimeString()} ({s.trades.length} trades)
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedSession && (
        <>
          <div className="flex items-center gap-2 mb-3">
            {playbackState.isPlaying ? (
              <button
                onClick={handlePause}
                className="p-2 bg-gray-900 rounded hover:bg-gray-800"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handlePlay}
                className="p-2 bg-[#00FF41] text-black rounded hover:bg-green-400"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            )}
            <button
              onClick={handleStop}
              className="p-2 bg-gray-900 rounded hover:bg-gray-800"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>

            <div className="flex-1" />

            <select
              value={playbackState.speed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-xs"
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
          </div>

          <div className="mb-2">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={playbackState.progress}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-900 rounded appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #00FF41 ${playbackState.progress}%, #1a1a1a ${playbackState.progress}%)`,
              }}
            />
          </div>

          <div className="flex justify-between text-gray-600">
            <span>{formatTime(playbackState.currentTime - playbackState.startTime)}</span>
            <span>{formatTime(playbackState.endTime - playbackState.startTime)}</span>
          </div>
        </>
      )}

      {sessions.length === 0 && !isRecording && (
        <div className="text-gray-600 text-center py-4">
          Start recording to capture trade data
        </div>
      )}
    </div>
  );
}
