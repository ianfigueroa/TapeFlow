// Clock with millisecond precision - updates via direct DOM manipulation at 60fps

import { useEffect, useRef } from 'react';
import { globalClock } from '../services/globalClock';

export function RealTimeClock() {
  const timeRef = useRef<HTMLSpanElement>(null);
  const msRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsubscribe = globalClock.subscribe((timestamp) => {
      const { hours, minutes, seconds, milliseconds } = globalClock.formatTime(timestamp);

      if (timeRef.current) {
        timeRef.current.textContent = `${hours}:${minutes}:${seconds}`;
      }
      if (msRef.current) {
        msRef.current.textContent = `.${milliseconds}`;
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div className="flex items-center gap-2 font-mono">
      <span className="text-gray-600 text-xs uppercase tracking-wider">TIME</span>
      <div className="flex items-baseline tabular-nums">
        <span ref={timeRef} className="text-white text-sm font-bold">00:00:00</span>
        <span ref={msRef} className="text-gray-500 text-xs">.000</span>
      </div>
    </div>
  );
}
