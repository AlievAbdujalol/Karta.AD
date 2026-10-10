import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import SiteView from '@/pages/SiteView';

const mock = vi.hoisted(() => ({ html: '' }));

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'ver-1' }) }));
vi.mock('@/api/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { html: mock.html, files: null }, error: null }),
          }),
        }),
      }),
    }),
  },
}));

const WITH_TITLE = '<html><head><title>AD Sneakers — магазин кроссовок</title></head><body></body></html>';
const WITHOUT_TITLE = '<html><head></head><body></body></html>';

afterEach(() => {
  document.title = '';
});

describe('SiteView', () => {
  it('вкладка получает заголовок опубликованного сайта', async () => {
    mock.html = WITH_TITLE;
    render(<SiteView />);
    await waitFor(() => expect(document.title).toBe('AD Sneakers — магазин кроссовок'));
  });

  it('без <title> в html заголовок вкладки не трогаем', async () => {
    mock.html = WITHOUT_TITLE;
    document.title = 'Karta-AD — транспорт Таджикистана';
    render(<SiteView />);
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    expect(document.title).toBe('Karta-AD — транспорт Таджикистана');
  });
});
