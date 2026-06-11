import { useState, useEffect } from 'react';
import { translations } from './i18n';

const LANG_KEY = 'bustrack_lang';

export function useLanguage() {
  const [lang, setLangState] = useState(() => localStorage.getItem(LANG_KEY) || 'ru');

  useEffect(() => {
    const handler = (e) => {
      if (e.key === LANG_KEY && e.newValue) {
        setLangState(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setLang = (newLang) => {
    localStorage.setItem(LANG_KEY, newLang);
    setLangState(newLang);
    window.dispatchEvent(new StorageEvent('storage', { key: LANG_KEY, newValue: newLang }));
  };

  const t = (key) => translations[lang]?.[key] ?? translations.ru?.[key] ?? key;

  return { lang, setLang, t };
}