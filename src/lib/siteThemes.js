/**
 * siteThemes.js — 8 пресетов оформления для визарда «AI-сайт» (шаг 2).
 * id обязаны совпадать с CHECK website_settings_style_check в БД
 * (minimal|modern|luxury|dark|street|fashion|glass|ai).
 * Чистые данные + генератор превью; покрыто тестами (siteThemes.test.js).
 */

export const SITE_THEMES = [
  {
    id: 'minimal',
    label: 'Минимализм',
    description: 'Много воздуха, тонкая типографика, акцент на контенте',
    font: 'Inter',
    dark: false,
    primary: '#111827',
    gradient: 'linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%)',
    surface: '#ffffff',
    text: '#111827',
    muted: '#6b7280',
    radius: '8px',
  },
  {
    id: 'modern',
    label: 'Современный',
    description: 'Яркий акцент, скруглённые карточки, дружелюбный тон',
    font: 'Inter',
    dark: false,
    primary: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    radius: '16px',
  },
  {
    id: 'luxury',
    label: 'Люкс',
    description: 'Тёмный фон, золотые акценты, премиальная подача',
    font: 'Playfair Display',
    dark: true,
    primary: '#d4af37',
    gradient: 'linear-gradient(135deg, #1c1917 0%, #292524 60%, #78716c 100%)',
    surface: '#1c1917',
    text: '#fafaf9',
    muted: '#a8a29e',
    radius: '4px',
  },
  {
    id: 'dark',
    label: 'Тёмная тема',
    description: 'Ночной интерфейс с неоновым акцентом',
    font: 'Inter',
    dark: true,
    primary: '#22d3ee',
    gradient: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
    surface: '#0f172a',
    text: '#e2e8f0',
    muted: '#94a3b8',
    radius: '12px',
  },
  {
    id: 'street',
    label: 'Стрит',
    description: 'Контрастные цвета, крупные заголовки, энергия улицы',
    font: 'Arial Black',
    dark: false,
    primary: '#f97316',
    gradient: 'linear-gradient(135deg, #fef3c7 0%, #fdba74 100%)',
    surface: '#ffffff',
    text: '#1c1917',
    muted: '#57534e',
    radius: '0px',
  },
  {
    id: 'fashion',
    label: 'Фэшн',
    description: 'Сдержанный шик, тонкие линии, фокус на фото',
    font: 'Helvetica',
    dark: false,
    primary: '#be185d',
    gradient: 'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 100%)',
    surface: '#ffffff',
    text: '#18181b',
    muted: '#71717a',
    radius: '2px',
  },
  {
    id: 'glass',
    label: 'Стекло',
    description: 'Градиенты и полупрозрачные панели — стиль Karta-AD',
    font: 'Inter',
    dark: true,
    primary: '#a78bfa',
    gradient: 'linear-gradient(135deg, #312e81 0%, #6d28d9 50%, #0891b2 100%)',
    surface: 'rgba(255,255,255,0.08)',
    text: '#f8fafc',
    muted: '#cbd5e1',
    radius: '20px',
  },
  {
    id: 'ai',
    label: 'AI-стиль',
    description: 'Футуризм, светящиеся бордеры, технологичный вид',
    font: 'Inter',
    dark: true,
    primary: '#34d399',
    gradient: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #0f766e 100%)',
    surface: '#022c22',
    text: '#ecfdf5',
    muted: '#6ee7b7',
    radius: '14px',
  },
];

export const DEFAULT_THEME_ID = 'modern';

/** Пресет по id; неизвестный id → дефолтный (modern). */
export function getTheme(id) {
  return SITE_THEMES.find((t) => t.id === id) || SITE_THEMES.find((t) => t.id === DEFAULT_THEME_ID);
}

/**
 * Маппинг пресета в theme структуры siteBuilder ({ primary, dark }),
 * который compileSite() использует для генерации HTML.
 */
export function toStructureTheme(id) {
  const t = getTheme(id);
  return { primary: t.primary, dark: t.dark };
}
