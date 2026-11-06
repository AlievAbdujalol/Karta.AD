import { describe, it, expect } from 'vitest';
import { speechErrorText } from '@/lib/speech';

/**
 * Единые сообщения об ошибках Web Speech API: раньше каждое место
 * (AiChat, SearchBar, MultiStopPlanner, MapEventsSheet) либо молча
 * сбрасывало флаг, либо писало свой текст — пользователь видел
 * «нажал микрофон и ничего не происходит».
 */
describe('speechErrorText — тексты ошибок голосового ввода', () => {
  it('aborted и пустой код — без тоста (null)', () => {
    expect(speechErrorText('aborted')).toBeNull();
    expect(speechErrorText(undefined)).toBeNull();
    expect(speechErrorText('')).toBeNull();
    expect(speechErrorText(null)).toBeNull();
  });

  it.each([
    ['not-allowed', /микрофон/i],
    ['service-not-allowed', /распознавания речи/i],
    ['no-speech', /речь не распознана/i],
    ['network', /сеть/i],
    ['audio-capture', /микрофон недоступен/i],
    ['some-unknown-code', /не удалось/i],
  ])('%s → понятный текст вместо молчания', (code, pattern) => {
    const text = speechErrorText(code);
    expect(text).toBeTruthy();
    expect(String(text)).toMatch(pattern);
  });

  it('тексты не раскрывают технические детали (стек, URL, коды браузера)', () => {
    for (const code of ['not-allowed', 'network', 'audio-capture', 'no-speech']) {
      const text = String(speechErrorText(code));
      expect(text).not.toMatch(/Error|undefined|null|http/i);
    }
  });
});
