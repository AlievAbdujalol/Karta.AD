import { useTranslation } from 'react-i18next';

export const LANG_KEY = 'bustrack_lang';

export function useLanguage() {
  const { i18n, t } = useTranslation();

  const setLang = (newLang) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem(LANG_KEY, newLang);
  };

  return { lang: i18n.language, setLang, t };
}
