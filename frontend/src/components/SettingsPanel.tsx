// Settings panel for color customization and visualization toggles

import { useState } from 'react';
import { cn } from '../lib/utils';
import { useSettingsStore } from '../stores/useSettingsStore';
import { usePaperTradingStore } from '../stores/usePaperTradingStore';

// Types for tabs
type TabId = 'colors' | 'display' | 'trading' | 'alerts' | 'hotkeys' | 'profiles';

interface TabConfig {
  id: TabId;
  label: string;
}

const TABS: TabConfig[] = [
  { id: 'colors', label: 'COLORS' },
  { id: 'display', label: 'DISPLAY' },
  { id: 'trading', label: 'TRADING' },
  { id: 'alerts', label: 'ALERTS' },
  { id: 'hotkeys', label: 'HOTKEYS' },
  { id: 'profiles', label: 'PROFILES' },
];

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

// Hotkey row for the hotkeys tab
function HotkeyRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-400">{description}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <kbd key={i} className="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-300">
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('colors');
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

  // Paper trading settings
  const paperSettings = usePaperTradingStore((state) => ({
    startingBalance: state.balance,
    slippageBps: state.settings?.slippageBps || 5,
    feeBps: state.settings?.feeBps || 4,
  }));
  const updatePaperSettings = usePaperTradingStore((state) => state.updateSettings);
  const resetPaperTrading = usePaperTradingStore((state) => state.reset);

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

        <div className="flex flex-wrap gap-2 mt-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded text-xs font-mono transition-colors",
                activeTab === tab.id
                  ? "bg-[#00FF41] text-black"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              )}
            >
              {tab.label}
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

        {activeTab === 'display' && (
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

        {activeTab === 'trading' && (
          <div className="space-y-4">
            <h3 className="text-sm font-mono text-gray-500 uppercase">Paper Trading Settings</h3>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Slippage (bps)</span>
              <input
                type="number"
                value={paperSettings.slippageBps}
                onChange={(e) => updatePaperSettings?.({ slippageBps: parseInt(e.target.value) || 5 })}
                min={0}
                max={100}
                className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Trading Fee (bps)</span>
              <input
                type="number"
                value={paperSettings.feeBps}
                onChange={(e) => updatePaperSettings?.({ feeBps: parseInt(e.target.value) || 4 })}
                min={0}
                max={50}
                className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
              />
            </div>

            <div className="pt-4 border-t border-gray-800">
              <h4 className="text-sm font-mono text-gray-500 uppercase mb-3">Risk Controls</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Max Position Size ($)</span>
                  <input
                    type="number"
                    defaultValue={100000}
                    min={1000}
                    className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Daily Loss Limit ($)</span>
                  <input
                    type="number"
                    defaultValue={5000}
                    min={100}
                    className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Max Open Positions</span>
                  <input
                    type="number"
                    defaultValue={5}
                    min={1}
                    max={20}
                    className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => resetPaperTrading?.()}
              className="w-full py-2 bg-red-900/50 hover:bg-red-900 rounded text-sm text-red-400 transition-colors"
            >
              Reset Paper Trading Account
            </button>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-4">
            <h3 className="text-sm font-mono text-gray-500 uppercase">Alert Settings</h3>
            
            <div className="space-y-3">
              <Toggle
                label="Enable Sound Alerts"
                checked={visualization.enableSoundAlerts}
                onChange={() => updateVisualization({ enableSoundAlerts: !visualization.enableSoundAlerts })}
              />
              <Toggle
                label="Enable Desktop Notifications"
                checked={visualization.enableDesktopNotifications}
                onChange={() => updateVisualization({ enableDesktopNotifications: !visualization.enableDesktopNotifications })}
              />
              <Toggle
                label="Enable Visual Highlights"
                checked={true}
                onChange={() => {}}
              />
            </div>
            
            <div className="pt-4 border-t border-gray-800">
              <h4 className="text-sm font-mono text-gray-500 uppercase mb-3">Default Cooldowns</h4>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Alert Cooldown (seconds)</span>
                <input
                  type="number"
                  value={visualization.alertCooldownSeconds}
                  onChange={(e) => updateVisualization({ alertCooldownSeconds: Math.max(1, Math.min(300, parseInt(e.target.value) || 5)) })}
                  min={1}
                  max={300}
                  className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
                />
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-800">
              <h4 className="text-sm font-mono text-gray-500 uppercase mb-3">Quick Alert Presets</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex items-center justify-between p-2 bg-gray-900 rounded">
                  <span>Whale Trade (&gt;$50K)</span>
                  <span className="text-[#00FF41]">Active</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-900 rounded">
                  <span>Price Break (1% move)</span>
                  <span className="text-[#00FF41]">Active</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-900 rounded">
                  <span>High OPS (&gt;100/s)</span>
                  <span className="text-gray-600">Inactive</span>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Configure custom alerts in the Alerts Panel
              </p>
            </div>
          </div>
        )}

        {activeTab === 'hotkeys' && (
          <div className="space-y-4">
            <h3 className="text-sm font-mono text-gray-500 uppercase">Keyboard Shortcuts</h3>
            
            <div className="space-y-1">
              <h4 className="text-xs text-gray-500 uppercase mt-3 mb-2">Navigation</h4>
              <HotkeyRow keys={['?']} description="Show keyboard shortcuts" />
              <HotkeyRow keys={['S']} description="Focus symbol search" />
              <HotkeyRow keys={['Esc']} description="Close dialogs / Unfocus" />
              
              <h4 className="text-xs text-gray-500 uppercase mt-4 mb-2">Trading</h4>
              <HotkeyRow keys={['B']} description="Quick buy at market" />
              <HotkeyRow keys={['N']} description="Quick sell at market" />
              <HotkeyRow keys={['F']} description="Flatten position" />
              <HotkeyRow keys={['C']} description="Cancel all orders" />
              
              <h4 className="text-xs text-gray-500 uppercase mt-4 mb-2">View</h4>
              <HotkeyRow keys={['1']} description="Toggle Time & Sales" />
              <HotkeyRow keys={['2']} description="Toggle Chart" />
              <HotkeyRow keys={['3']} description="Toggle Order Book" />
              <HotkeyRow keys={['Space']} description="Pause/Resume tape scroll" />
              
              <h4 className="text-xs text-gray-500 uppercase mt-4 mb-2">Zoom</h4>
              <HotkeyRow keys={['+']} description="Zoom in chart" />
              <HotkeyRow keys={['-']} description="Zoom out chart" />
              <HotkeyRow keys={['0']} description="Reset zoom" />
            </div>
            
            <p className="text-xs text-gray-600 mt-4">
              Press <kbd className="px-1 bg-gray-800 rounded">?</kbd> anywhere to see the full shortcuts panel
            </p>
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
