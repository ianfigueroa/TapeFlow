/**
 * Theme Context - Manages application theme state
 * Provides theme toggling with localStorage persistence
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type ThemeName = 'hacker' | 'pro';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  isHacker: boolean;
  isPro: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'tapeflow-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    // Load from localStorage on initial mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'pro' || saved === 'hacker') {
        return saved;
      }
    }
    return 'hacker'; // Default theme
  });

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    
    if (theme === 'pro') {
      root.classList.add('theme-pro');
      root.classList.remove('theme-hacker');
    } else {
      root.classList.add('theme-hacker');
      root.classList.remove('theme-pro');
    }
    
    // Persist to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'hacker' ? 'pro' : 'hacker');
  }, []);

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    isHacker: theme === 'hacker',
    isPro: theme === 'pro',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Standalone hook for components that just need to read theme
export function useThemeValue(): ThemeName {
  const { theme } = useTheme();
  return theme;
}
