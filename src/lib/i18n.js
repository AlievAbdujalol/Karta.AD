import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from '@/locales/en.json';
import ru from '@/locales/ru.json';
import tg from '@/locales/tg.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      tg: { translation: tg },
    },
    fallbackLng: 'tg',
    interpolation: { escapeValue: false },
  });

export default i18n;
