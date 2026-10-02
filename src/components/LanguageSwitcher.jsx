import { useLanguage } from '@/lib/useLanguage';

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex gap-2">
      <button onClick={() => setLang('tg')} className={lang === 'tg' ? 'font-bold' : ''}>TG</button>
      <button onClick={() => setLang('ru')} className={lang === 'ru' ? 'font-bold' : ''}>RU</button>
      <button onClick={() => setLang('en')} className={lang === 'en' ? 'font-bold' : ''}>EN</button>
    </div>
  );
}
