// LayoutControls - UI for managing layout presets, lock state, and panel visibility
// Used in SettingsPanel's Layout tab

import { useState } from 'react';
import { cn } from '../../lib/utils';
import { useLayoutStore } from '../../stores/useLayoutStore';

// Icons
const LockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const UnlockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const ResetIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export interface LayoutControlsProps {
  className?: string;
}

/**
 * Controls for managing layout presets and lock state.
 * Includes preset selector, save/delete/reset buttons, and lock toggle.
 */
export function LayoutControls({ className }: LayoutControlsProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Get store state
  const activePresetId = useLayoutStore((state) => state.activePresetId);
  const presets = useLayoutStore((state) => state.presets);
  const isLocked = useLayoutStore((state) => state.isLocked);
  const loadPreset = useLayoutStore((state) => state.loadPreset);
  const savePreset = useLayoutStore((state) => state.savePreset);
  const deletePreset = useLayoutStore((state) => state.deletePreset);
  const setLocked = useLayoutStore((state) => state.setLocked);
  const resetToDefault = useLayoutStore((state) => state.resetToDefault);

  // Get current preset
  const currentPreset = presets.find((p) => p.id === activePresetId);
  const isCustomPreset = currentPreset && !currentPreset.isBuiltIn;

  // Handle preset selection
  const handleSelectPreset = (presetId: string) => {
    loadPreset(presetId);
    setIsDropdownOpen(false);
  };

  // Handle save preset
  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim());
      setNewPresetName('');
      setIsSaveDialogOpen(false);
    }
  };

  // Handle delete preset
  const handleDeletePreset = () => {
    if (isCustomPreset) {
      deletePreset(activePresetId);
    }
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Preset Selector Row */}
      <div className="flex items-center gap-2">
        {/* Preset Dropdown */}
        <div className="relative flex-1">
          <button
            data-testid="preset-selector"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-black border border-gray-800 rounded text-sm font-mono text-gray-300 hover:border-gray-700 transition-colors"
          >
            <span>{currentPreset?.name || 'Select Preset'}</span>
            <ChevronDownIcon />
          </button>

          {isDropdownOpen && (
            <div className="absolute z-50 w-full mt-1 bg-black border border-gray-800 rounded shadow-lg max-h-60 overflow-y-auto">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm font-mono transition-colors',
                    preset.id === activePresetId
                      ? 'bg-[#00FF41]/10 text-[#00FF41]'
                      : 'text-gray-300 hover:bg-gray-900'
                  )}
                >
                  {preset.name}
                  {!preset.isBuiltIn && (
                    <span className="ml-2 text-xs text-gray-600">(custom)</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lock Toggle */}
        <button
          data-testid="lock-toggle"
          onClick={() => setLocked(!isLocked)}
          aria-pressed={isLocked}
          className={cn(
            'p-2 rounded border transition-colors',
            isLocked
              ? 'bg-[#00FF41]/10 border-[#00FF41] text-[#00FF41]'
              : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700'
          )}
          title={isLocked ? 'Unlock Layout' : 'Lock Layout'}
        >
          {isLocked ? <LockIcon /> : <UnlockIcon />}
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center gap-2">
        {/* Save Button */}
        <button
          data-testid="save-preset-btn"
          onClick={() => setIsSaveDialogOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-black border border-gray-800 rounded text-sm font-mono text-gray-400 hover:text-[#00FF41] hover:border-[#00FF41]/50 transition-colors"
        >
          <SaveIcon />
          Save
        </button>

        {/* Delete Button (only for custom presets) */}
        {isCustomPreset && (
          <button
            data-testid="delete-preset-btn"
            onClick={handleDeletePreset}
            className="flex items-center gap-1 px-3 py-1.5 bg-black border border-gray-800 rounded text-sm font-mono text-gray-400 hover:text-[#FF4545] hover:border-[#FF4545]/50 transition-colors"
          >
            <TrashIcon />
            Delete
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Reset Button */}
        <button
          data-testid="reset-layout-btn"
          onClick={resetToDefault}
          className="flex items-center gap-1 px-3 py-1.5 bg-black border border-gray-800 rounded text-sm font-mono text-gray-400 hover:text-orange-500 hover:border-orange-500/50 transition-colors"
        >
          <ResetIcon />
          Reset
        </button>
      </div>

      {/* Save Dialog */}
      {isSaveDialogOpen && (
        <div
          data-testid="save-preset-dialog"
          className="p-3 bg-gray-900 border border-gray-800 rounded"
        >
          <label className="block text-xs font-mono text-gray-500 mb-2">
            Preset Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Enter preset name"
              className="flex-1 px-3 py-2 bg-black border border-gray-800 rounded text-sm font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-[#00FF41]"
              autoFocus
            />
            <button
              data-testid="confirm-save-btn"
              onClick={handleSavePreset}
              disabled={!newPresetName.trim()}
              className={cn(
                'px-3 py-2 rounded text-sm font-mono transition-colors',
                newPresetName.trim()
                  ? 'bg-[#00FF41]/10 text-[#00FF41] hover:bg-[#00FF41]/20'
                  : 'bg-gray-900 text-gray-600 cursor-not-allowed'
              )}
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsSaveDialogOpen(false);
                setNewPresetName('');
              }}
              className="px-3 py-2 bg-gray-900 border border-gray-800 rounded text-sm font-mono text-gray-400 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Lock State Indicator */}
      {isLocked && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#00FF41]/5 border border-[#00FF41]/20 rounded text-xs font-mono text-[#00FF41]">
          <LockIcon />
          Layout is locked. Unlock to drag or resize panels.
        </div>
      )}
    </div>
  );
}
