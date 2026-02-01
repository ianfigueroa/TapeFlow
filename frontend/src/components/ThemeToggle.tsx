/**
 * ThemeToggle - Toggle between Hacker and Pro themes
 * Displays a terminal/matrix icon for hacker mode and a professional icon for pro mode
 */

import { useTheme } from '../hooks/useTheme';
import { cn } from '../lib/utils';

// Terminal/Matrix icon for Hacker theme
const HackerIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <path d="M6 8l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="10" y1="12" x2="14" y2="12" strokeLinecap="round" />
  </svg>
);

// Briefcase/Professional icon for Pro theme
const ProIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    <line x1="6" y1="12" x2="18" y2="12" />
  </svg>
);

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme, isHacker } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200",
        isHacker
          ? "border-[#00FF00] text-[#00FF00] hover:bg-[#001100] hover:shadow-[0_0_10px_rgba(0,255,0,0.3)]"
          : "border-[#58a6ff] text-[#58a6ff] hover:bg-[#1f3a5c] hover:shadow-[0_0_10px_rgba(88,166,255,0.3)]",
        className
      )}
      title={`Switch to ${isHacker ? 'Pro' : 'Hacker'} theme`}
    >
      {isHacker ? <HackerIcon /> : <ProIcon />}
      {showLabel && (
        <span className="text-xs font-mono uppercase tracking-wider">
          {theme}
        </span>
      )}
    </button>
  );
}

export default ThemeToggle;
