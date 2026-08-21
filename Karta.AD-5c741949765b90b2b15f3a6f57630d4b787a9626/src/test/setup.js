import '@testing-library/jest-dom';

// jsdom doesn't implement window.matchMedia — provide a no-op stub
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// localStorage may be absent in the test environment (Node experimental localStorage)
// — provide an in-memory polyfill shared by all tests
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: {
      getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
      setItem: (k, v) => { store.set(String(k), String(v)); },
      removeItem: (k) => { store.delete(String(k)); },
      clear: () => { store.clear(); },
    },
  });
}
