// Settings panel for color customization and visualization toggles

import { useState } from 'react';
import { cn } from '../lib/utils';
import { useSettingsStore } from '../stores/useSettingsStore';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-300"
        />
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "w-12 h-6 rounded-full transition-colors relative",
          checked ? "bg-[#00FF41]" : "bg-gray-700"
        )}
      >
        <div
          className={cn(
            "w-5 h-5 bg-white rounded-full transition-transform absolute top-0.5",
            checked ? "translate-x-6" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'colors' | 'charts' | 'profiles'>('colors');
  const [newProfileName, setNewProfileName] = useState('');

  const colors = useSettingsStore((state) => state.colors);
  const updateColors = useSettingsStore((state) => state.updateColors);
  const resetColors = useSettingsStore((state) => state.resetColors);
  const visualization = useSettingsStore((state) => state.visualization);
  const updateVisualization = useSettingsStore((state) => state.updateVisualization);
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfile = useSettingsStore((state) => state.activeProfile);
  const saveProfile = useSettingsStore((state) => state.saveProfile);
  const loadProfile = useSettingsStore((state) => state.loadProfile);
  const deleteProfile = useSettingsStore((state) => state.deleteProfile);

  return (
    <div className="bg-black rounded-xl border border-gray-800 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-mono text-[#00FF41]">&gt; SETTINGS</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          {(['colors', 'charts', 'profiles'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-mono transition-colors",
                activeTab === tab
                  ? "bg-[#00FF41] text-black"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              )}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === 'colors' && (
          <>
            <div className="space-y-4">
              <h3 className="text-sm font-mono text-gray-500 uppercase">Trade Colors</h3>
              <ColorPicker
                label="Buy Color"
                value={colors.buyColor}
                onChange={(c) => updateColors({ buyColor: c })}
              />
              <ColorPicker
                label="Sell Color"
                value={colors.sellColor}
                onChange={(c) => updateColors({ sellColor: c })}
              />
              <ColorPicker
                label="Buy Background"
                value={colors.buyBackground}
                onChange={(c) => updateColors({ buyBackground: c })}
              />
              <ColorPicker
                label="Sell Background"
                value={colors.sellBackground}
                onChange={(c) => updateColors({ sellBackground: c })}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-mono text-gray-500 uppercase">Intensity Settings</h3>
              <Toggle
                label="Size-based intensity"
                checked={colors.intensityEnabled}
                onChange={(checked) => updateColors({ intensityEnabled: checked })}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Whale threshold ($)</span>
                <input
                  type="number"
                  value={colors.whaleThreshold}
                  onChange={(e) => updateColors({ whaleThreshold: parseInt(e.target.value) || 50000 })}
                  className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-mono text-gray-500 uppercase">Chart Colors</h3>
              <ColorPicker
                label="Price Line"
                value={colors.priceLineColor}
                onChange={(c) => updateColors({ priceLineColor: c })}
              />
              <ColorPicker
                label="Volume Bars"
                value={colors.volumeBarColor}
                onChange={(c) => updateColors({ volumeBarColor: c })}
              />
              <ColorPicker
                label="VWAP Line"
                value={colors.vwapLineColor}
                onChange={(c) => updateColors({ vwapLineColor: c })}
              />
              <ColorPicker
                label="Delta Positive"
                value={colors.deltaPositiveColor}
                onChange={(c) => updateColors({ deltaPositiveColor: c })}
              />
              <ColorPicker
                label="Delta Negative"
                value={colors.deltaNegativeColor}
                onChange={(c) => updateColors({ deltaNegativeColor: c })}
              />
            </div>

            <button
              onClick={resetColors}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-400 transition-colors"
            >
              Reset to Defaults
            </button>
          </>
        )}

        {activeTab === 'charts' && (
          <div className="space-y-4">
            <h3 className="text-sm font-mono text-gray-500 uppercase">Visualization Panels</h3>
            <Toggle
              label="Show Price Chart"
              checked={visualization.showPriceChart}
              onChange={(checked) => updateVisualization({ showPriceChart: checked })}
            />
            <Toggle
              label="Show Volume Chart"
              checked={visualization.showVolumeChart}
              onChange={(checked) => updateVisualization({ showVolumeChart: checked })}
            />
            <Toggle
              label="Show Delta Chart"
              checked={visualization.showDeltaChart}
              onChange={(checked) => updateVisualization({ showDeltaChart: checked })}
            />
            <Toggle
              label="Show VWAP Line"
              checked={visualization.showVwapLine}
              onChange={(checked) => updateVisualization({ showVwapLine: checked })}
            />
            <Toggle
              label="Show Order Book Heatmap"
              checked={visualization.showHeatmap}
              onChange={(checked) => updateVisualization({ showHeatmap: checked })}
            />
            <Toggle
              label="Show Footprint Chart"
              checked={visualization.showFootprint}
              onChange={(checked) => updateVisualization({ showFootprint: checked })}
            />

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Chart Height (px)</span>
              <input
                type="number"
                value={visualization.chartHeight}
                onChange={(e) => updateVisualization({ chartHeight: parseInt(e.target.value) || 200 })}
                min={100}
                max={400}
                className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
              />
            </div>
          </div>
        )}

        {activeTab === 'profiles' && (
          <div className="space-y-4">
            <h3 className="text-sm font-mono text-gray-500 uppercase">Theme Profiles</h3>
            
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div
                  key={profile.name}
                  className={cn(
                    "flex items-center justify-between p-3 rounded border transition-colors",
                    activeProfile === profile.name
                      ? "border-[#00FF41] bg-[#001100]"
                      : "border-gray-800 hover:border-gray-700"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: profile.colors.buyColor }}
                      />
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: profile.colors.sellColor }}
                      />
                    </div>
                    <span className="text-sm text-gray-300">{profile.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadProfile(profile.name)}
                      className={cn(
                        "px-2 py-1 text-xs rounded transition-colors",
                        activeProfile === profile.name
                          ? "bg-[#00FF41] text-black"
                          : "bg-gray-800 text-gray-400 hover:text-white"
                      )}
                    >
                      {activeProfile === profile.name ? 'Active' : 'Load'}
                    </button>
                    {!['Terminal', 'Classic', 'Ocean', 'High Contrast'].includes(profile.name) && (
                      <button
                        onClick={() => deleteProfile(profile.name)}
                        className="px-2 py-1 text-xs bg-red-900/50 text-red-400 rounded hover:bg-red-900 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-800">
              <h4 className="text-sm text-gray-400 mb-2">Save Current as New Profile</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Profile name..."
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
                />
                <button
                  onClick={() => {
                    if (newProfileName.trim()) {
                      saveProfile(newProfileName.trim());
                      setNewProfileName('');
                    }
                  }}
                  className="px-4 py-2 bg-[#00FF41] text-black rounded text-sm font-medium hover:bg-[#00DD35] transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
