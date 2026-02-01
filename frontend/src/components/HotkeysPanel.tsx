/**
 * HotkeysPanel - Keyboard Shortcuts Modal
 * 
 * Professional trading terminal keyboard shortcuts reference
 * Triggered by pressing "?" or "Shift+/"
 */

import { useEffect, memo } from 'react';
import { useTheme } from '../hooks/useTheme';

interface HotkeysPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HotkeyGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', '1-9'], description: 'Switch to symbol tab 1-9' },
      { keys: ['Ctrl', 'Tab'], description: 'Next symbol tab' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Previous symbol tab' },
      { keys: ['Ctrl', 'N'], description: 'Add new symbol' },
      { keys: ['Ctrl', 'W'], description: 'Close current symbol tab' },
      { keys: ['?'], description: 'Show/hide this panel' },
      { keys: ['Esc'], description: 'Close panels/modals' },
    ],
  },
  {
    title: 'Trading (Paper Mode)',
    shortcuts: [
      { keys: ['B'], description: 'Quick buy at market' },
      { keys: ['S'], description: 'Quick sell at market' },
      { keys: ['Shift', 'B'], description: 'Limit buy at best bid' },
      { keys: ['Shift', 'S'], description: 'Limit sell at best ask' },
      { keys: ['X'], description: 'Cancel all open orders' },
      { keys: ['F'], description: 'Flatten position (close all)' },
    ],
  },
  {
    title: 'View Controls',
    shortcuts: [
      { keys: ['Space'], description: 'Pause/Resume data feed' },
      { keys: ['R'], description: 'Reset/clear trades' },
      { keys: ['P'], description: 'Toggle paper trading panel' },
      { keys: ['G'], description: 'Toggle settings' },
      { keys: ['A'], description: 'Toggle alerts panel' },
      { keys: ['H'], description: 'Toggle trade history' },
    ],
  },
  {
    title: 'Chart Controls',
    shortcuts: [
      { keys: ['+'], description: 'Zoom in chart' },
      { keys: ['-'], description: 'Zoom out chart' },
      { keys: ['0'], description: 'Auto-scale chart' },
      { keys: ['['], description: 'Decrease time interval' },
      { keys: [']'], description: 'Increase time interval' },
    ],
  },
];

const KeyBadge = memo(function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-mono text-gray-300 min-w-[24px] text-center">
      {children}
    </kbd>
  );
});

export const HotkeysPanel = memo(function HotkeysPanel({ isOpen, onClose }: HotkeysPanelProps) {
  const { isHacker } = useTheme();
  const accentColor = isHacker ? '#00FF00' : '#58a6ff';
  
  // Handle escape to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div 
        className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider" style={{ color: accentColor }}>
            ⌨ Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {HOTKEY_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-gray-500 mb-3 border-b border-gray-800 pb-2">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIdx) => (
                          <span key={keyIdx} className="flex items-center gap-1">
                            {keyIdx > 0 && <span className="text-gray-600 text-xs">+</span>}
                            <KeyBadge>{key}</KeyBadge>
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 font-mono text-right flex-1">
                        {shortcut.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer tip */}
          <div className="mt-6 pt-4 border-t border-gray-800">
            <p className="text-[10px] text-gray-600 font-mono text-center">
              Press <KeyBadge>?</KeyBadge> or <KeyBadge>Esc</KeyBadge> to close this panel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

export default HotkeysPanel;
