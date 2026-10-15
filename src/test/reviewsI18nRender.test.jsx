import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

/**
 * Регресс со скриншота: на /reviews пользователь видел сырые ключи
 * («reviews.tabCommunity») и старую шапку. Причина была не в коде, а в
 * устаревшей сборке/кэше, НО этот тест страхует самое уязвимое место:
 * Reviews обязан рендерить НАСТОЯЩИЕ подписи из locales через реальный
 * i18next, а не замоканный useLanguage. Если ключи выпадут из ru/en/tg
 * или сломается инициализация i18n — тест упадёт, а не промолчит.
 */
const supportApi = vi.hoisted(() => ({
  isSupportDeveloper: vi.fn(async () => false),
  fetchFeed: vi.fn(async () => []),
  fetchReactions: vi.fn(async () => ({ counts: {}, mine: {} })),
  fetchMyTickets: vi.fn(async () => []),
  fetchUnreadDevMessages: vi.fn(async () => ({})),
  subscribe: vi.fn(() => null),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supportApi', () => supportApi);
vi.mock('@/lib/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u1' } }),
}));
vi.mock('@/api/entities', () => ({
  Route: { list: vi.fn(async () => []) },
  Vehicle: { list: vi.fn(async () => []) },
  Review: { list: vi.fn(async () => []) },
}));
vi.mock('@/api/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      order: vi.fn().mockReturnThis(),
      then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
    })),
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x/pub' } })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://x/sig' }, error: null })),
        remove: vi.fn(async () => ({ error: null })),
      })),
    },
    channel: vi.fn(() => ({ on: vi.fn(() => ({})), subscribe: vi.fn(() => ({})) })),
    removeChannel: vi.fn(),
  },
}));

import i18n from '../lib/i18n';
import Reviews from '../pages/Reviews';

beforeEach(async () => {
  vi.clearAllMocks();
  // реальный i18next, выбранный язык — русский (основной язык площадки)
  await i18n.changeLanguage('ru');
});

afterEach(cleanup);

describe('/reviews — реальные локали, а не сырые ключи', () => {
  it('вкладки и шапка показывают переводы из ru.json', async () => {
    render(<Reviews />);

    expect(await screen.findByRole('tab', { name: 'Сообщество' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Обращения' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Оценить поездку' })).toBeTruthy();

    // шапка — актуальные значения, а не старые «Отзывы»/«Оцените поездку»
    expect(screen.getByText('Отзывы и поддержка')).toBeTruthy();
    expect(screen.getByText('Сообщество, обращения и оценка поездок')).toBeTruthy();

    // контент вкладки «Сообщество» тоже переведён
    expect(await screen.findByText('Публикации участников')).toBeTruthy();
    expect(screen.getByText('Пока нет публикаций — будьте первым!')).toBeTruthy();
  });

  it('ни один i18n-ключ раздела не «просачивается» в интерфейс', async () => {
    render(<Reviews />);
    await screen.findByRole('tab', { name: 'Сообщество' });
    // сырые ключи выглядят как «reviews.xxx»/«support.xxx» в видимом тексте
    const leaked = (document.body.textContent || '').match(
      /\b(?:reviews|support)\.[a-zA-Z]+/
    );
    expect(leaked).toBeNull();
  });

  it('английский язык отдаёт en-переводы, а не ключи', async () => {
    await i18n.changeLanguage('en');
    render(<Reviews />);
    expect(await screen.findByRole('tab', { name: 'Community' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Rate trip' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Reviews & Support')).toBeTruthy());
  });
});
