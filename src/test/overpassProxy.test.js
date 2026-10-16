/**
 * Тесты серверного прокси /api/overpass (api/overpass.js).
 *
 * Модуль — ESM для Vercel (package.json: "type": "module"), грузим его
 * динамическим import'ом ПОСЛЕ фиксации env: константы там читаются из
 * process.env в момент загрузки модуля (env фиксируем через vi.stubEnv,
 * т.к. в этом конфиге eslint'а нет node-глобалов). Зеркала берём из того
 * же JSON, что клиент и прокси — расхождения списков исключено по построению.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import MIRRORS from '../lib/overpassMirrors.json';

vi.stubEnv('OVERPASS_BACKOFF_MS', '0');
vi.stubEnv('OVERPASS_RATE_MAX', '5');

const { default: handler } = await import('../../api/overpass.js');

const QUERY = '[out:json][timeout:5];node["highway"="bus_stop"](1,2,3,4);out tags 1;';

function makeReq({ method = 'POST', body, query, ip = '10.0.0.1' } = {}) {
  return {
    method,
    body: body === undefined ? 'data=' + encodeURIComponent(QUERY) : body,
    query: query || {},
    headers: { 'x-forwarded-for': ip },
    // сырой поток: конец передаём сразу (в тестах «сырого» тела нет)
    on(event, cb) {
      if (event === 'end') queueMicrotask(cb);
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk; },
  };
}

function okResponse(text = '{"elements":[]}') {
  return { ok: true, status: 200, text: async () => text };
}

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `10.1.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/overpass', () => {
  it('200: первый живой JSON отдаём как есть, запрос уходит на первое зеркало', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq({ ip: nextIp() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"elements":[]}');
    expect(res.headers['content-type']).toContain('application/json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(MIRRORS[0]);
    expect(fetchMock.mock.calls[0][1].body).toBe('data=' + encodeURIComponent(QUERY));
  });

  it('упавшее зеркало (504) уходит в запасное — ответ всё равно 200', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce(okResponse('{"elements":[1]}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq({ ip: nextIp() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"elements":[1]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(MIRRORS[1]);
  });

  it('сеть упала (reject) — идём к следующему зеркалу', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq({ ip: nextIp() }), res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('не-JSON с ответом 200 не отдаём клиенту', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse('<html>oops</html>'))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq({ ip: nextIp() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"elements":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('все зеркала 429 — пробрасываем 429 с Retry-After (клиентский кулдаун живёт)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq({ ip: nextIp() }), res);

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(JSON.parse(res.body).error).toBe('overpass_unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(MIRRORS.length);
  });

  it('все зеркала упали по сети — 502 без внутренностей', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    const res = makeRes();

    await handler(makeReq({ ip: nextIp() }), res);

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: 'overpass_unavailable' });
  });
});

describe('GET /api/overpass', () => {
  it('цепочки stops/AI шлют GET ?data=… — прокси принимает и его', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq({ method: 'GET', body: null, query: { data: QUERY }, ip: nextIp() }), res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe('data=' + encodeURIComponent(QUERY));
  });
});

describe('валидация и лимиты', () => {
  it('без data → 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = makeRes();
    await handler(makeReq({ body: null, ip: nextIp() }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'bad_query' });
  });

  it('не overpass-запрос (нет [out:) → 400 — прокси не использовать как ретранслятор', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = makeRes();
    await handler(makeReq({ body: 'data=' + encodeURIComponent('DROP TABLE users'), ip: nextIp() }), res);
    expect(res.statusCode).toBe(400);
  });

  it('запрос длиннее лимита → 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = makeRes();
    const long = '[out:json];' + 'x'.repeat(5000);
    await handler(makeReq({ body: 'data=' + encodeURIComponent(long), ip: nextIp() }), res);
    expect(res.statusCode).toBe(400);
  });

  it('чужой метод → 405', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', ip: nextIp() }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
  });

  it('rate limit: 6-й запрос с одного IP за окно → 429 без похода к зеркалам', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const ip = nextIp();

    for (let i = 0; i < 5; i++) {
      const r = makeRes();
      await handler(makeReq({ ip }), r);
      expect(r.statusCode).toBe(200);
    }
    const res6 = makeRes();
    await handler(makeReq({ ip }), res6);

    expect(res6.statusCode).toBe(429);
    expect(res6.headers['retry-after']).toBe('60');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
