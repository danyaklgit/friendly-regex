import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

/**
 * Two-axis theming.
 *
 * - `theme` ('light' | 'dark') drives the existing color-mode tokens. Unchanged
 *   behavior; persisted to `theme_preference`.
 * - `brand` ('swittle' | 'bwatech') drives the brand skin (logo + primary color).
 *   Persisted to `brand_preference`. The bwatech brand composes cleanly with
 *   both light AND dark — the `.bwatech` class is applied alongside `.dark`,
 *   not instead of it. Setting `brand = 'bwatech'` is the only way an operator
 *   can preview the user-mode look before authenticating; once they log in as
 *   role=user the app forces bwatech regardless of the persisted preference.
 */

type Theme = 'light' | 'dark';
export type Brand = 'swittle' | 'bwatech';

interface ThemeContextValue {
  theme: Theme;
  brand: Brand;
  toggleTheme: () => void;
  setBrand: (brand: Brand) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'theme_preference';
const BRAND_STORAGE_KEY = 'brand_preference';

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* ignore */ }
  return 'light';
}

function getInitialBrand(): Brand {
  try {
    const stored = localStorage.getItem(BRAND_STORAGE_KEY);
    if (stored === 'bwatech' || stored === 'swittle') return stored;
  } catch { /* ignore */ }
  return 'swittle';
}

function applyClassToDOM(cls: string, on: boolean) {
  if (on) document.documentElement.classList.add(cls);
  else document.documentElement.classList.remove(cls);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [brand, setBrandState] = useState<Brand>(getInitialBrand);

  useEffect(() => {
    applyClassToDOM('dark', theme === 'dark');
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    applyClassToDOM('bwatech', brand === 'bwatech');
    try { localStorage.setItem(BRAND_STORAGE_KEY, brand); } catch { /* ignore */ }
  }, [brand]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setBrand = useCallback((next: Brand) => {
    setBrandState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, brand, toggleTheme, setBrand }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
