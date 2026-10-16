/**
 * aiProxyHandler.test.ts — тесты серверной логики Edge Function ai-proxy
 * (supabase/functions/ai-proxy/handler.ts): авторизация, валидация входа,
 * отсутствие секрета, ошибки upstream, платные модели, rate limit,
 * отсутствие утечки ключа в ответы.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleRequest,
  isFreePricing,
  createRateLimiter,
  normalizeChatBody,
  MAX_CHAT_PER_MIN_PER_USER,
  MAX_CONTENT_CHARS,
  __resetModelsCacheForTests,
  type ProxyDeps,
} from '../../supabase/functions/ai-proxy/handler';

const KEY = 'sk-or-v1-TESTKEY-DO-NOT-LEAK';

const UPSTREAM_MODELS = {
  data: [
    { id: 'free/small', name: 'Small Free', pricing: { prompt: '0', completion: '0' } },
    { id: 'paid/big', name: 'Big Paid', pricing: { prompt: '0.001', completion: '0.002' } },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const defaultFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/models')) return jsonResponse(UPSTREAM_MODELS);
  if (url.includes('/chat/completions')) {
    return jsonResponse({ choices: [{ message: { content: 'привет' } }] });
  }
  return jsonResponse({}, 404);
});

type Overrides = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  getUser?: (jwt: string) => Promise<string | null>;
  extra?: Record<string, unknown>;
};

function makeDeps(overrides: Overrides = {}) {
  const logUsage = vi.fn();
  const envMap: Record<string, string | undefined> = {
    OPENROUTER_API_KEY: KEY,
    ...(overrides.env ?? {}),
  };
  const fetchImpl =
    overrides.fetchImpl ??
    (defaultFetch as unknown as typeof fetch);
  const deps: ProxyDeps = {
    env: (n: string) => envMap[n],
    fetchImpl,
    getUser: overrides.getUser ?? (async (jwt: string) => (jwt === 'good-jwt' ? 'user-1' : null)),
    logUsage,
    rateLimiter: createRateLimiter(MAX_CHAT_PER_MIN_PER_USER, 60_000),
    ...(overrides.extra ?? {}),
  };
  return { deps, fetchImpl, logUsage };
}

function makeReq(
  action: string,
  opts: { method?: string; body?: unknown; auth?: string | null } = {},
) {
  const { method = 'GET', body, auth = 'good-jwt' } = opts;
  return new Request(`https://x.supabase.co/functions/v1/ai-proxy?action=${action}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

const chatBody = { model: 'free/small', messages: [{ role: 'user', content: 'привет' }] };

beforeEach(() => {
  __resetModelsCacheForTests();
  defaultFetch.mockClear();
});

describe('авторизация', () => {
  it('без заголовка Authorization → 401 unauthorized', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody, auth: null }), deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'unauthorized' } });
  });

  it('невалидный JWT (getUser → null) → 401; валидный получает userId', async () => {
    const bad = makeDeps({ getUser: async () => null });
    const res = await handleRequest(makeReq('models', { auth: 'bad-jwt' }), bad.deps);
    expect(res.status).toBe(401);

    const seen: string[] = [];
    const good = makeDeps({
      getUser: async (jwt: string) => {
        seen.push(jwt);
        return 'user-1';
      },
    });
    const res2 = await handleRequest(makeReq('models', { auth: 'good-jwt' }), good.deps);
    expect(res2.status).toBe(200);
    expect(seen).toEqual(['good-jwt']);
  });

  it('исключение в getUser → 500 без раскрытия деталей', async () => {
    const { deps } = makeDeps({
      getUser: async () => {
        throw new Error('INTERNAL_DB_SECRET_DETAIL');
      },
    });
    const res = await handleRequest(makeReq('models'), deps);
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('internal');
    expect(text).not.toContain('INTERNAL_DB_SECRET_DETAIL');
  });
});

describe('отсутствие серверного секрета', () => {
  it('GET models без OPENROUTER_API_KEY → 503 no_server_key', async () => {
    const { deps } = makeDeps({ env: { OPENROUTER_API_KEY: undefined } });
    const res = await handleRequest(makeReq('models'), deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'no_server_key' } });
  });

  it('POST chat без OPENROUTER_API_KEY → 503 no_server_key', async () => {
    const { deps } = makeDeps({ env: { OPENROUTER_API_KEY: '' } });
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'no_server_key' } });
  });
});

describe('action=models', () => {
  it('возвращает только бесплатные модели в формате клиента', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(makeReq('models'), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toEqual({ id: 'free/small', name: 'Small Free', prompt: '0', completion: '0' });
  });

  it('кэширует каталог (один запрос upstream)', async () => {
    const { deps, fetchImpl } = makeDeps();
    await handleRequest(makeReq('models'), deps);
    await handleRequest(makeReq('models'), deps);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ошибка upstream → 502 без внутренних деталей', async () => {
    const { deps } = makeDeps({ fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch });
    const res = await handleRequest(makeReq('models'), deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'upstream_error' } });
  });
});

describe('action=chat', () => {
  it('успех: бесплатная модель → текст, free:true, лог outcome=ok', async () => {
    const { deps, logUsage } = makeDeps();
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      text: 'привет',
      model: 'free/small',
      free: true,
    });
    expect(logUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'ok', user_id: 'user-1' }));
  });

  it('неизвестная модель → 404 unknown_model', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(
      makeReq('chat', { method: 'POST', body: { ...chatBody, model: 'nope/none' } }),
      deps,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'unknown_model' } });
  });

  it('некорректный JSON → 400 bad_request', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: '{oops' }), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'bad_request' } });
  });
});

describe('платные модели (защита кредитов владельца ключа)', () => {
  const paidBody = { ...chatBody, model: 'paid/big' };

  it('платная модель без allowPaid → 402 paid_model', async () => {
    const { deps, logUsage } = makeDeps();
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: paidBody }), deps);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'paid_model' } });
    expect(logUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'denied_paid' }));
  });

  it('allowPaid:true из тела запроса БЕЗ серверного флага → всё равно 402', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(
      makeReq('chat', { method: 'POST', body: { ...paidBody, allowPaid: true } }),
      deps,
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.message).toContain('отключены на сервере');
  });

  it('allowPaid:true С серверным OPENROUTER_PAID_ALLOWED=true → пропускается', async () => {
    const { deps } = makeDeps({ env: { OPENROUTER_PAID_ALLOWED: 'true' } });
    const res = await handleRequest(
      makeReq('chat', { method: 'POST', body: { ...paidBody, allowPaid: true } }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, free: false });
  });
});

describe('валидация входных данных', () => {
  it('content не-строка → 400', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(
      makeReq('chat', {
        method: 'POST',
        body: { model: 'free/small', messages: [{ role: 'user', content: 42 }] },
      }),
      deps,
    );
    expect(res.status).toBe(400);
  });

  it('недопустимая роль → 400', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(
      makeReq('chat', {
        method: 'POST',
        body: { model: 'free/small', messages: [{ role: 'tool', content: 'x' }] },
      }),
      deps,
    );
    expect(res.status).toBe(400);
  });

  it('слишком длинное сообщение → 413 payload_too_large', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(
      makeReq('chat', {
        method: 'POST',
        body: {
          model: 'free/small',
          messages: [{ role: 'user', content: 'x'.repeat(MAX_CONTENT_CHARS + 1) }],
        },
      }),
      deps,
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'payload_too_large' } });
  });

  it('messages пустой массив → 400', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(
      makeReq('chat', { method: 'POST', body: { model: 'free/small', messages: [] } }),
      deps,
    );
    expect(res.status).toBe(400);
  });
});

describe('rate limit', () => {
  it('21-й запрос за минуту → 429 с retry_after', async () => {
    const { deps } = makeDeps();
    let last: Response | null = null;
    for (let i = 0; i < MAX_CHAT_PER_MIN_PER_USER + 1; i++) {
      last = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    }
    expect(last).not.toBeNull();
    expect(last!.status).toBe(429);
    const body = await last!.json();
    expect(body.error.code).toBe('ratelimit');
    expect(typeof body.error.retry_after).toBe('number');
  });
});

describe('ошибки upstream без раскрытия секретов', () => {
  it('upstream 401 → 502 «ключ недействителен», ключ не утекает', async () => {
    const { deps } = makeDeps({
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/models')) return jsonResponse(UPSTREAM_MODELS);
        return jsonResponse({ error: { message: 'bad key ' + KEY } }, 401);
      }) as unknown as typeof fetch,
    });
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('недействителен');
    expect(text).not.toContain(KEY);
  });

  it('upstream 429 → 429 ratelimit', async () => {
    const { deps } = makeDeps({
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/models')) return jsonResponse(UPSTREAM_MODELS);
        return jsonResponse({ error: { message: 'rate limited' } }, 429);
      }) as unknown as typeof fetch,
    });
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'ratelimit' } });
  });

  it('upstream 500 → 502 openrouter_error, текст усечён', async () => {
    const { deps } = makeDeps({
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/models')) return jsonResponse(UPSTREAM_MODELS);
        return jsonResponse({ error: { message: 'm'.repeat(1000) } }, 500);
      }) as unknown as typeof fetch,
    });
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('openrouter_error');
    expect(body.error.message.length).toBeLessThanOrEqual(300);
  });

  it('сетевой сбой fetch → 502, ключ не в ответе', async () => {
    const { deps } = makeDeps({
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/models')) return jsonResponse(UPSTREAM_MODELS);
        throw new Error('connect failed with ' + KEY);
      }) as unknown as typeof fetch,
    });
    const res = await handleRequest(makeReq('chat', { method: 'POST', body: chatBody }), deps);
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(KEY);
  });
});

describe('CORS и маршрутизация', () => {
  it('OPTIONS → 200 с CORS-заголовками', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(makeReq('models', { method: 'OPTIONS' }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('неизвестное действие → 404 not_found', async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(makeReq('zzz'), deps);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'not_found' } });
  });
});

// ─── чистые функции ──────────────────────────────────────────────────

describe('isFreePricing', () => {
  it('распознаёт бесплатные модели', () => {
    expect(isFreePricing({ prompt: '0', completion: '0' })).toBe(true);
    expect(isFreePricing({ prompt: '0.001', completion: '0' })).toBe(false);
    expect(isFreePricing(null)).toBe(false);
    expect(isFreePricing(undefined)).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('окно сбрасывается по времени', () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.check('u', 0).ok).toBe(true);
    expect(limiter.check('u', 100).ok).toBe(true);
    expect(limiter.check('u', 200).ok).toBe(false);
    expect(limiter.check('u', 1201).ok).toBe(true);
  });

  it('лимиты независимы по ключу', () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.check('a', 0).ok).toBe(true);
    expect(limiter.check('b', 0).ok).toBe(true);
    expect(limiter.check('a', 10).ok).toBe(false);
  });
});

describe('normalizeChatBody', () => {
  it('клампит max_tokens и не округляет temperature', () => {
    const r = normalizeChatBody({
      model: 'm/x',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 999999,
      temperature: 0.3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.maxTokens).toBe(16000);
      expect(r.value.temperature).toBe(0.3);
    }
  });

  it('нечисловой max_tokens → значение по умолчанию', () => {
    const r = normalizeChatBody({
      model: 'm/x',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 'lots',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.maxTokens).toBe(8000);
  });

  it('отрезает старые сообщения (не больше 20)', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const r = normalizeChatBody({ model: 'm/x', messages });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.messages).toHaveLength(20);
      expect(r.value.messages[19].content).toBe('m29');
    }
  });
});
