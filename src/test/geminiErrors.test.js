import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiError, geminiErrorText, geminiGenerate } from '@/lib/gemini';

// В тестах ключ всегда «есть» — geminiGenerate без ключа молча возвращает null
vi.mock('@/lib/userKeys', () => ({ getApiKey: () => 'test-key' }));

describe('geminiErrorText — честные сообщения по типу ошибки', () => {
  it('каждый тип даёт своё понятное сообщение', () => {
    expect(geminiErrorText(new GeminiError('HTTP 401', 401, 'auth'))).toMatch(/ключ/i);
    expect(geminiErrorText(new GeminiError('HTTP 429', 429, 'rate'))).toMatch(/запросов/i);
    expect(geminiErrorText(new GeminiError('HTTP 404', 404, 'model'))).toMatch(/модель/i);
    expect(geminiErrorText(new GeminiError('HTTP 503', 503, 'server'))).toMatch(/временно недоступен/i);
    expect(geminiErrorText(new GeminiError('timeout', 0, 'timeout'))).toMatch(/не ответил/i);
    expect(geminiErrorText(new GeminiError('Failed to fetch', 0, 'network'))).toMatch(/интернет/i);
  });

  it('ошибка сервера ИИ НЕ маскируется под «ошибку сети»', () => {
    const msg = geminiErrorText(new GeminiError('HTTP 503', 503, 'server'));
    expect(msg).not.toMatch(/интернет/);
    expect(geminiErrorText(new GeminiError('timeout', 0, 'timeout'))).not.toMatch(/интернет/);
  });

  it('не-GeminiError — универсальный fallback', () => {
    expect(geminiErrorText(new Error('boom'))).toMatch(/попробуй позже/i);
    expect(geminiErrorText(undefined)).toMatch(/попробуй позже/i);
  });
});

describe('geminiGenerate — классификация HTTP-ошибок', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('400 API_KEY_INVALID → auth (не «сеть»), без ретраев', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"API_KEY_INVALID"}}',
    });
    await expect(geminiGenerate('hi', { retries: 0 })).rejects.toMatchObject({ type: 'auth', status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('503 → server после исчерпания ретраев', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'overloaded' });
    await expect(geminiGenerate('hi', { retries: 0 })).rejects.toMatchObject({ type: 'server' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('выброс fetch → network (настоящая проблема сети)', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(geminiGenerate('hi', { retries: 0 })).rejects.toMatchObject({ type: 'network' });
  });

  it('успех: возвращает текст, отбрасывая thought-части', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'привет' }, { text: 'скрытая мысль', thought: true }] } }],
      }),
    });
    await expect(geminiGenerate('hi', { retries: 0 })).resolves.toBe('привет');
  });
});
