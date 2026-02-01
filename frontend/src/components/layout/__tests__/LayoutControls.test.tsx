import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useLayoutStore
const mockStore = {
  activePresetId: 'default',
  presets: [
    { id: 'default', name: 'Default', isBuiltIn: true, layouts: {} },
    { id: 'wide-chart', name: 'Wide Chart', isBuiltIn: true, layouts: {} },
    { id: 'order-flow-focus', name: 'Order Flow Focus', isBuiltIn: true, layouts: {} },
    { id: 'compact', name: 'Compact', isBuiltIn: true, layouts: {} },
    { id: 'custom-1', name: 'My Custom', isBuiltIn: false, layouts: {} },
  ],
  isLocked: false,
  hiddenPanels: [] as string[],
  loadPreset: vi.fn(),
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
  setLocked: vi.fn(),
  resetToDefault: vi.fn(),
  togglePanel: vi.fn(),
};

vi.mock('../../../stores/useLayoutStore', () => ({
  useLayoutStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockStore);
    }
    return mockStore;
  }),
}));

import { LayoutControls } from '../LayoutControls';

describe('LayoutControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.isLocked = false;
    mockStore.activePresetId = 'default';
    mockStore.hiddenPanels = [];
  });

  it('should render preset selector', () => {
    render(<LayoutControls />);

    expect(screen.getByTestId('preset-selector')).toBeInTheDocument();
  });

  it('should display current preset name', () => {
    render(<LayoutControls />);

    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('should show all presets in dropdown', () => {
    render(<LayoutControls />);

    // Open dropdown
    fireEvent.click(screen.getByTestId('preset-selector'));

    expect(screen.getByText('Wide Chart')).toBeInTheDocument();
    expect(screen.getByText('Order Flow Focus')).toBeInTheDocument();
    expect(screen.getByText('Compact')).toBeInTheDocument();
    expect(screen.getByText('My Custom')).toBeInTheDocument();
  });

  it('should call loadPreset when selecting a preset', () => {
    render(<LayoutControls />);

    fireEvent.click(screen.getByTestId('preset-selector'));
    fireEvent.click(screen.getByText('Wide Chart'));

    expect(mockStore.loadPreset).toHaveBeenCalledWith('wide-chart');
  });

  it('should render lock toggle button', () => {
    render(<LayoutControls />);

    expect(screen.getByTestId('lock-toggle')).toBeInTheDocument();
  });

  it('should show unlocked icon when isLocked is false', () => {
    mockStore.isLocked = false;
    render(<LayoutControls />);

    const lockButton = screen.getByTestId('lock-toggle');
    expect(lockButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('should show locked icon when isLocked is true', () => {
    mockStore.isLocked = true;
    render(<LayoutControls />);

    const lockButton = screen.getByTestId('lock-toggle');
    expect(lockButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('should call setLocked when clicking lock toggle', () => {
    mockStore.isLocked = false;
    render(<LayoutControls />);

    fireEvent.click(screen.getByTestId('lock-toggle'));

    expect(mockStore.setLocked).toHaveBeenCalledWith(true);
  });

  it('should render save preset button', () => {
    render(<LayoutControls />);

    expect(screen.getByTestId('save-preset-btn')).toBeInTheDocument();
  });

  it('should render reset button', () => {
    render(<LayoutControls />);

    expect(screen.getByTestId('reset-layout-btn')).toBeInTheDocument();
  });

  it('should call resetToDefault when clicking reset', () => {
    render(<LayoutControls />);

    fireEvent.click(screen.getByTestId('reset-layout-btn'));

    expect(mockStore.resetToDefault).toHaveBeenCalled();
  });

  it('should show save dialog when clicking save button', () => {
    render(<LayoutControls />);

    fireEvent.click(screen.getByTestId('save-preset-btn'));

    expect(screen.getByTestId('save-preset-dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/preset name/i)).toBeInTheDocument();
  });

  it('should call savePreset with name from dialog', () => {
    render(<LayoutControls />);

    fireEvent.click(screen.getByTestId('save-preset-btn'));
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), {
      target: { value: 'My New Layout' },
    });
    fireEvent.click(screen.getByTestId('confirm-save-btn'));

    expect(mockStore.savePreset).toHaveBeenCalledWith('My New Layout');
  });

  it('should show delete button for custom presets', () => {
    mockStore.activePresetId = 'custom-1';
    render(<LayoutControls />);

    expect(screen.getByTestId('delete-preset-btn')).toBeInTheDocument();
  });

  it('should not show delete button for built-in presets', () => {
    mockStore.activePresetId = 'default';
    render(<LayoutControls />);

    expect(screen.queryByTestId('delete-preset-btn')).not.toBeInTheDocument();
  });

  it('should call deletePreset when confirming delete', () => {
    mockStore.activePresetId = 'custom-1';
    render(<LayoutControls />);

    fireEvent.click(screen.getByTestId('delete-preset-btn'));

    expect(mockStore.deletePreset).toHaveBeenCalledWith('custom-1');
  });
});
