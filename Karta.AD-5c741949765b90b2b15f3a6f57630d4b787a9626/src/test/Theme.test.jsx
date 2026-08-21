import React, { useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { ThemeProvider, useTheme } from 'next-themes';

const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

function ThemeTestHelper({ themeToSet }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (themeToSet) {
      setTheme(themeToSet);
    }
  }, [themeToSet, setTheme]);
  return null;
}

describe('Theme - Property Based Testing', () => {
  it('Property 15: Theme persists in localStorage (round-trip)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('light', 'dark', 'system'),
        (theme) => {
          window.localStorage.clear();

          const { unmount } = render(
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <ThemeTestHelper themeToSet={theme} />
            </ThemeProvider>
          );

          expect(window.localStorage.getItem('theme')).toBe(theme);

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});
