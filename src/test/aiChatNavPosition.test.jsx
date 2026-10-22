import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null }) }));
vi.mock('@/lib/aiAssistant', () => ({
  askAssistant: vi.fn(async () => ''),
  getChatSuggestions: vi.fn(async () => null),
  speakText: vi.fn(),
  stopSpeak: vi.fn(),
  resolvePlaceFromText: vi.fn(async () => null),
  getMyPosition: vi.fn(async () => null),
}));
vi.mock('@/lib/gemini', () => ({
  isGeminiConfigured: () => false,
  GeminiError: class GeminiError extends Error {},
  geminiErrorText: (e) => (e && e.message) || 'err',
}));
vi.mock('@/lib/userKeys', () => ({ loadUserKeys: vi.fn(async () => ({ gemini: null })) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AiChat from '@/components/AiChat';

const renderChat = (props = {}) =>
  render(
    <MemoryRouter>
      <AiChat cityName="Бишкек" {...props} />
    </MemoryRouter>
  );

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: 'ИИ-помощник' }));

describe('AiChat — позиция кнопки и панели относительно нижней панели', () => {
  beforeAll(() => {
    // jsdom не реализует Element.scrollTo — нужен для эффекта прокрутки чата
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(cleanup);

  it('обычный режим: кнопка остаётся на bottom-[104px] (выше BottomSheet)', () => {
    renderChat();
    const btn = screen.getByRole('button', { name: 'ИИ-помощник' });
    expect(btn.className).toContain('bottom-[104px]');
    expect(btn.className).not.toContain('bottom-[136px]');
  });

  it('навигация (navMode): кнопка поднята до bottom-[136px] — выше карточки статистики (верх ≈128px)', () => {
    renderChat({ navMode: true });
    const btn = screen.getByRole('button', { name: 'ИИ-помощник' });
    expect(btn.className).toContain('bottom-[136px]');
    expect(btn.className).not.toContain('bottom-[104px]');
  });

  it('обычный режим: открытая панель на bottom-[156px]', () => {
    renderChat();
    openPanel();
    expect(document.querySelector('[class*="bottom-[156px]"]')).toBeTruthy();
    expect(document.querySelector('[class*="bottom-[188px]"]')).toBeFalsy();
  });

  it('навигация (navMode): открытая панель поднята до bottom-[188px] — не ниже кнопки', () => {
    renderChat({ navMode: true });
    openPanel();
    expect(document.querySelector('[class*="bottom-[188px]"]')).toBeTruthy();
    expect(document.querySelector('[class*="bottom-[156px]"]')).toBeFalsy();
  });
});
