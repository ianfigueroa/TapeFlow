import { useEffect } from 'react';
import { DashboardLayout } from './components/DashboardLayout';
import { ThemeProvider } from './hooks/useTheme';
import { alertManager } from './utils/AlertManager';
import { useSettingsStore } from './stores/useSettingsStore';

function App() {
  // Request notification permission on mount if enabled in settings
  useEffect(() => {
    const settings = useSettingsStore.getState().visualization;
    if (settings.enableDesktopNotifications) {
      alertManager.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('[TapeFlow] Desktop notifications enabled');
        }
      });
    }
  }, []);

  return (
    <ThemeProvider>
      <DashboardLayout />
    </ThemeProvider>
  );
}

export default App;
