// Mode toggle switch for Live/Simulation data sources

import { cn } from '../lib/utils';

export type DataMode = 'LIVE' | 'SIM';

interface ModeToggleProps {
  mode: DataMode;
  onChange: (mode: DataMode) => void;
  disabled?: boolean;
  className?: string;
}

export function ModeToggle({ mode, onChange, disabled = false, className }: ModeToggleProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        onClick={() => onChange('LIVE')}
        disabled={disabled}
        className={cn(
          "px-2 py-1 text-xs font-mono rounded-l border transition-all",
          mode === 'LIVE'
            ? "bg-[#001100] border-[#00FF41] text-[#00FF41]"
            : "bg-black border-gray-700 text-gray-500 hover:text-gray-400 hover:border-gray-600",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        LIVE
      </button>
      <button
        onClick={() => onChange('SIM')}
        disabled={disabled}
        className={cn(
          "px-2 py-1 text-xs font-mono rounded-r border-l-0 border transition-all",
          mode === 'SIM'
            ? "bg-[#110011] border-[#A855F7] text-[#A855F7]"
            : "bg-black border-gray-700 text-gray-500 hover:text-gray-400 hover:border-gray-600",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        SIM
      </button>
    </div>
  );
}
