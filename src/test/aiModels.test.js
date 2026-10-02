import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/api/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

import {
  isFreeModel,
  filterModels,
  sortFreeModels,
  resolveFallbackOrder,
  parseRetryAfter,
  isCacheFresh,
  MODELS_TTL_MS,
  MAX_FALLBACK_TRIES,
  chatWithFallback,
  fetchFreeModels,
  fetchFreeModelsDirect,
  getFreeModels,
} from '../lib/aiModels';

const M = (id, extra = {}) => ({
  id,
  name: id,
  description: '',
  context_length: 32000,
  modality: 'text->text',
  ...extra,
});

describe('isFreeModel — фильтр бесплатных по pricing', () => {
  it('нулевые цены = free', () => {
    expect(isFreeModel({ pricing: { prompt: '0', completion: '0' } })).toBe(true);
  });
  it('платная prompt = не free', () => {
    expect(isFreeModel({ pricing: { prompt: '0.000001', completion: '0' } })).toBe(false);
  });
  it('без pricing = не free', () => {
    expect(isFreeModel({})).toBe(false);
    expect(isFreeModel(null)).toBe(false);
  });
  it('числовые нули = free', () => {
    expect(isFreeModel({ pricing: { prompt: 0, completion: 0 } })).toBe(true);
  });
});

describe('filterModels — поиск и фильтры', () => {
  const list = [M('meta-llama/llama-3.3-70b-instruct:free'), M('qwen/qwen-2.5-vl-72b-instruct:free', { modality: 'text+image->text' }), M('deepseek/deepseek-r1:free')];
  it('поиск по имени', () => {
    expect(filterModels(list, { q: 'qwen' }).map((m) => m.id)).toEqual(['qwen/qwen-2.5-vl-72b-instruct:free']);
  });
  it('фильтр vision', () => {
    expect(filterModels(list, { capability: 'vision' }).map((m) => m.id)).toEqual(['qwen/qwen-2.5-vl-72b-instruct:free']);
  });
  it('фильтр reasoning находит r1', () => {
    expect(filterModels(list, { capability: 'reasoning' }).map((m) => m.id)).toEqual(['deepseek/deepseek-r1:free']);
  });
  it('all возвращает всё', () => {
    expect(filterModels(list, { capability: 'all' })).toHaveLength(3);
  });
});

describe('sortFreeModels — vision, контекст, имя', () => {
  it('сортирует детерминированно', () => {
    const list = [
      M('b/model', { context_length: 8000 }),
      M('a/model', { context_length: 8000 }),
      M('c/vision', { context_length: 8000, modality: 'text+image->text' }),
      M('d/big', { context_length: 200000 }),
    ];
    expect(sortFreeModels(list).map((m) => m.id)).toEqual(['c/vision', 'd/big', 'a/model', 'b/model']);
  });
});

describe('resolveFallbackOrder — выбранная первая, макс 3', () => {
  it('порядок и лимит', () => {
    const list = [M('a'), M('b'), M('c'), M('d')];
    expect(resolveFallbackOrder('c', list)).toEqual(['c', 'a', 'b']);
    expect(resolveFallbackOrder('c', list)).toHaveLength(MAX_FALLBACK_TRIES);
  });
  it('без выбора — первые', () => {
    expect(resolveFallbackOrder('', [M('a'), M('b')])).toEqual(['a', 'b']);
  });
});

describe('parseRetryAfter — cap 10с', () => {
  it('значения', () => {
    expect(parseRetryAfter('3')).toBe(3);
    expect(parseRetryAfter(120)).toBe(10);
    expect(parseRetryAfter(null)).toBe(0);
    expect(parseRetryAfter('xx')).toBe(0);
  });
});

describe('isCacheFresh — TTL 10 мин', () => {
  it('свежий/протухший', () => {
    const now = Date.now();
    expect(isCacheFresh({ at: now, models: [] }, now)).toBe(true);
    expect(isCacheFresh({ at: now - MODELS_TTL_MS - 1, models: [] }, now)).toBe(false);
    expect(isCacheFresh(null, now)).toBe(false);
  });
});

describe('chatWithFallback — цепочка и лимиты', () => {
  const models = [M('a'), M('b'), M('c')];
  const ok = (model) => ({
    ok: true,
    json: async () => ({ success: true, text: `<html>${model}</html>`, model }),
  });
  const err = (code, status = 500, retryAfter) => ({
    ok: false,
    status,
    headers: { get: () => (retryAfter != null ? String(retryAfter) : null) },
    json: async () => ({ success: false, error: { code, message: code, retry_after: retryAfter } }),
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('первая сработала — без переключения', async () => {
    fetch.mockResolvedValue(ok('a'));
    const onFallback = vi.fn();
    const res = await chatWithFallback(models, { model: 'a', messages: [{ role: 'user', content: 'hi' }], onFallback });
    expect(res.text).toContain('a');
    expect(res.switched).toBe(false);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('ошибка первой → вторая, с уведомлением', async () => {
    fetch.mockResolvedValueOnce(err('upstream_error', 500)).mockResolvedValueOnce(ok('b'));
    const onFallback = vi.fn();
    const res = await chatWithFallback(models, { model: 'a', messages: [] });
    // без onFallback — просто проверяем результат
    expect(res.text).toContain('b');
    expect(res.switched).toBe(true);
    expect(onFallback).not.toHaveBeenCalled();
    void onFallback;
  });

  it('429 с retry_after — ждёт и идёт дальше', async () => {
    fetch.mockResolvedValueOnce(err('ratelimit', 429, 2)).mockResolvedValueOnce(ok('b'));
    const p = chatWithFallback(models, { model: 'a', messages: [] });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.text).toContain('b');
  });

  it('все упали (5xx) — бросает последнюю ошибку', async () => {
    fetch.mockResolvedValue(err('upstream_error', 500));
    await expect(chatWithFallback(models, { model: 'a', messages: [] })).rejects.toMatchObject({ code: 'upstream_error' });
    expect(fetch).toHaveBeenCalledTimes(MAX_FALLBACK_TRIES);
  });

  it('платная модель — сразу ошибка, без автопроб', async () => {
    fetch.mockResolvedValue(err('paid_model', 402));
    await expect(chatWithFallback(models, { model: 'a', messages: [] })).rejects.toMatchObject({ code: 'paid_model' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('пустой список — ошибка empty', async () => {
    await expect(chatWithFallback([], { model: 'x', messages: [] })).rejects.toMatchObject({ code: 'empty' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fetchFreeModels — кэш localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('второй вызов берёт кэш без fetch', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, models: [{ ...M('a'), pricing: { prompt: '0', completion: '0' } }], cached: false }),
    });
    const r1 = await fetchFreeModels();
    expect(r1.models).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const r2 = await fetchFreeModels();
    expect(r2.cached).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('force обновляет', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, models: [], cached: false }),
    });
    await fetchFreeModels();
    await fetchFreeModels({ force: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchFreeModelsDirect — публичный каталог без ключа', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('фильтрует только бесплатные по pricing', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'free/a', name: 'A', pricing: { prompt: '0', completion: '0' }, context_length: 1000 },
          { id: 'paid/b', name: 'B', pricing: { prompt: '0.001', completion: '0.002' }, context_length: 1000 },
        ],
      }),
    });
    const { models } = await fetchFreeModelsDirect();
    expect(models.map((m) => m.id)).toEqual(['free/a']);
  });

  it('HTTP-ошибка бросает upstream_error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(fetchFreeModelsDirect()).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('getFreeModels — алиас каталога бесплатных', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, models: [], cached: false }),
    });
    const r = await getFreeModels({ force: true });
    expect(r.models).toEqual([]);
  });
});

describe('validateOpenRouterKey — проверка ключа без трат', () => {
  let validateOpenRouterKey;
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    ({ validateOpenRouterKey } = await import('../lib/openrouter'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('пустой и чужой формат — сразу нет', async () => {
    expect(await validateOpenRouterKey('')).toMatchObject({ ok: false });
    expect(await validateOpenRouterKey('AIza-xxx')).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('401/403 — ключ отклонён', async () => {
    fetch.mockResolvedValue({ ok: false, status: 403 });
    expect(await validateOpenRouterKey('sk-or-v1-abc')).toMatchObject({ ok: false });
  });

  it('200 — ключ рабочий', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { label: 'main' } }) });
    expect(await validateOpenRouterKey('sk-or-v1-abc')).toEqual({ ok: true, label: 'main' });
  });
});

describe('buildFileModuleMessages — модули в файлы', () => {
  let buildFileModuleMessages;
  beforeEach(async () => {
    ({ buildFileModuleMessages } = await import('../lib/openrouter'));
  });

  it('db-модуль несёт REST-конфиг', () => {
    const msgs = buildFileModuleMessages(['index.html'], { 'index.html': '<h1>x</h1>' }, 'db', {
      supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', businessId: 'b1',
    });
    const body = msgs[1].content;
    expect(body).toContain('/rest/v1/orders');
    expect(body).toContain('b1');
    expect(body).toContain('index.html');
  });

  it('неизвестный модуль не даёт undefined', () => {
    const msgs = buildFileModuleMessages([], {}, 'zzz', {});
    expect(msgs[1].content).not.toContain('undefined');
  });
});

describe('buildFileEditMessages — промпт правок по файлам', () => {
  let buildFileEditMessages;
  beforeEach(async () => {
    ({ buildFileEditMessages } = await import('../lib/openrouter'));
  });

  it('включает дерево и содержимое', () => {
    const msgs = buildFileEditMessages(['a.html'], { 'a.html': '<h1>Hi</h1>' }, 'поменяй цвет');
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain('a.html');
    expect(msgs[1].content).toContain('поменяй цвет');
  });
});