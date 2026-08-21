import { useState, useEffect, useCallback } from 'react';
import { translations } from './i18n';

export const LANG_KEY = 'bustrack_lang';
const LANG_EVENT = 'bustrack_lang_change';

export function useLanguage() {
  const [lang, setLangState] = useState(() => localStorage.getItem(LANG_KEY) || 'ru');

  useEffect(() => {
    const handler = (e) => {
      const key = e.key || e.detail?.key;
      const newValue = e.newValue || e.detail?.newValue;
      if (key === LANG_KEY && newValue) {
        setLangState(newValue);
      }
    };
    window.addEventListener('storage', handler);
    window.addEventListener(LANG_EVENT, handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(LANG_EVENT, handler);
    };
  }, []);

  const setLang = useCallback((newLang) => {
    localStorage.setItem(LANG_KEY, newLang);
    setLangState(newLang);
    window.dispatchEvent(new StorageEvent('storage', { key: LANG_KEY, newValue: newLang }));
    window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { key: LANG_KEY, newValue: newLang } }));
  }, []);

  const resolveKey = useCallback((langCode, key) => {
    const keys = key.split('.');
    let obj = translations[langCode];
    for (const k of keys) {
      if (obj == null || typeof obj !== 'object') return undefined;
      obj = obj[k];
    }
    return typeof obj === 'string' ? obj : undefined;
  }, []);

  const t = useCallback((key) => {
    return resolveKey(lang, key) ?? resolveKey('ru', key) ?? key;
  }, [lang, resolveKey]);

  return { lang, setLang, t };
}