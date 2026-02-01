// Collapsible section for organized sidebar layout

import { useState, ReactNode } from 'react';
import { cn } from '../lib/utils';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  badgeColor?: 'green' | 'red' | 'yellow' | 'gray';
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  badge,
  badgeColor = 'gray',
  children,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const badgeColors = {
    green: 'bg-[#00FF41]/20 text-[#00FF41]',
    red: 'bg-[#FF4545]/20 text-[#FF4545]',
    yellow: 'bg-yellow-400/20 text-yellow-400',
    gray: 'bg-gray-800 text-gray-400',
  };

  return (
    <div className={cn('border-b border-gray-800', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={cn(
              'w-3 h-3 text-gray-600 transition-transform',
              isOpen && 'rotate-90'
            )}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
            {title}
          </span>
        </div>
        {badge !== undefined && (
          <span className={cn(
            'text-xs font-mono px-1.5 py-0.5 rounded',
            badgeColors[badgeColor]
          )}>
            {badge}
          </span>
        )}
      </button>

      <div className={cn(
        'overflow-hidden transition-all duration-200',
        isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        {children}
      </div>
    </div>
  );
}
