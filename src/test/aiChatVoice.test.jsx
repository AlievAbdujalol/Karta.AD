/**
 * Голосовой ввод помощника: микрофон не должен быть запрещён прод-заголовком,
 * а ошибки распознавания — проглатываться молча.
 *
 * Прод-симптом (06.11.2026, https://karta-ad.vercel.app): клик по микрофону
 * в чате помощника ничего не даёт — ни состояния прослушивания, ни тоста.
 * Причина: vercel.json отдавал `Permissions-Policy: ... microphone=()`,
 * из-за чего Web Speech API падает с not-allowed, а rec.onerror в AiChat
 * только сбрасывал флаг без единого слова пользователю.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from 'sonner';
import AiChat from '@/components/AiChat';

/** Управляемая заглушка SpeechRecognition: тест сам дёргает колбэки. */
class FakeRecognition {
  static last = null;
  constructor() {
    FakeRecognition.last = this;
    this.started = false;
  }
  start() {
    this.started = true;
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

function renderChat() {
  return render(
    <MemoryRouter>
      <AiChat cityName="Худжанд" />
    </MemoryRouter>,
  );
}

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: 'ИИ-помощник' }));
const micButton = () => screen.getByTitle('Голосовой ввод');

beforeAll(() => {
  // jsdom не реализует Element.scrollTo — нужен для эффекта прокрутки чата
  window.HTMLElement.prototype.scrollTo = vi.fn();
});

beforeEach(() => {
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  FakeRecognition.last = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

describe('AiChat — голосовой ввод', () => {
  it('клик по микрофону запускает распознавание и показывает состояние прослушивания', () => {
    renderChat();
    openPanel();

    fireEvent.click(micButton());

    expect(FakeRecognition.last).toBeTruthy();
    expect(FakeRecognition.last.started).toBe(true);
    expect(FakeRecognition.last.lang).toBe('ru-RU');
    // кнопка перешла в режим записи: красная заливка + пульс
    expect(micButton().className).toContain('bg-red-500');
  });

  it('распознанный текст уходит в отправку, а не теряется', () => {
    renderChat();
    openPanel();

    fireEvent.click(micButton());
    // колбэк распознавания приходит извне React — оборачиваем в act
    act(() => {
      FakeRecognition.last.onresult({
        results: [[{ transcript: 'Где ближайшая остановка' }]],
      });
    });

    // isGeminiConfigured=false → сообщение пользователя отображается в ленте
    expect(screen.getByText('Где ближайшая остановка')).toBeInTheDocument();
  });

  it('ошибка распознавания (not-allowed) объясняется тостом, а не проглатывается', () => {
    renderChat();
    openPanel();

    fireEvent.click(micButton());
    act(() => {
      FakeRecognition.last.onerror?.({ error: 'not-allowed' });
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(toast.error.mock.calls[0][0])).toMatch(/микрофон/i);
    // состояние записи сброшено — кнопку можно нажать снова
    expect(micButton()).toBeTruthy();
  });

  it.each([
    ['no-speech', /не распознана/i],
    ['network', /сеть/i],
    ['audio-capture', /микрофон недоступен/i],
    ['service-not-allowed', /распознавания речи/i],
    ['some-unknown-code', /не удалось/i],
  ])('ошибка %s тоже показывает тост (не проглатывается)', (code, pattern) => {
    renderChat();
    openPanel();

    fireEvent.click(micButton());
    act(() => {
      FakeRecognition.last.onerror?.({ error: code });
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(toast.error.mock.calls[0][0])).toMatch(pattern);
  });

  it('пользовательская остановка (aborted) не шумит тостом', () => {
    renderChat();
    openPanel();

    fireEvent.click(micButton());
    act(() => {
      FakeRecognition.last.onerror?.({ error: 'aborted' });
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('браузер без SpeechRecognition — понятный тост вместо пустого клика', () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    renderChat();
    openPanel();

    fireEvent.click(micButton());

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(toast.error.mock.calls[0][0])).toMatch(/не поддерживается/i);
  });
});
