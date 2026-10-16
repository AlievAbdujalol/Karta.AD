/**
 * Vercel serverless-прокси Overpass API (GET/POST /api/overpass).
 *
 * Зачем: браузер ходит на свой же origin — кросс-доменных падений зеркал
 * в консоли больше нет (браузер логирует каждый упавший CORS-запрос,
 * выкинуть эти логи невозможно), а перебор зеркал с таймаутами и ретраями
 * делает сервер. Возвращается JSON первого живого зеркала; 429/406
 * пробрасываются как есть — клиентские хуки держат по ним кулдауны.
 *
 * Зеркала — общий файл с клиентом: src/lib/overpassMirrors.json
 * (читается через fs, чтобы не зависеть от import-атрибутов JSON в Node).
 *
 * Наружу уходит только валидный overpass-запрос на фиксированный список
 * зеркал (SSRF исключён), длина ограничена, есть простейший rate limit
 * по IP (in-memory, лучший случай — один тёплый инстанс).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function loadMirrors() {
  // На Vercel путь резолвится от расположения модуля — nft трейсит этот паттерн.
  try {
    const p = fileURLToPath(new URL('../src/lib/overpassMirrors.json', import.meta.url));
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    // В тестовой среде (vite) import.meta.url приходит не в file://-схеме —
    // берём JSON относительно корня проекта (там же лежит и package.json).
    return JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/overpassMirrors.json'), 'utf8'));
  }
}

const MIRRORS = loadMirrors();

const PER_MIRROR_TIMEOUT_MS = 5000; // живые зеркала отвечают за 0.5–3 с
const TOTAL_BUDGET_MS = 45000; // жёсткий потолок (maxDuration в vercel.json — 60 с)
const RATE_WINDOW_MS = 60000;
const MAX_QUERY_LEN = 4096;
const MAX_RAW_BODY = 16384;
const RATE_BACKOFF_MS = Number(process.env.OVERPASS_BACKOFF_MS ?? 1200);
const RATE_MAX = Number(process.env.OVERPASS_RATE_MAX ?? 90);

/** ip -> метки запросов внутри окна */
const rateBuckets = new Map();

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.ip || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    rateBuckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(ip, hits);
  if (rateBuckets.size > 10000) {
    for (const [k, v] of rateBuckets) {
      if (!v.length || now - v[v.length - 1] >= RATE_WINDOW_MS) rateBuckets.delete(k);
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseForm(raw) {
  const m = raw.match(/(?:^|&)data=([^&]*)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

async function extractQuery(req) {
  // GET: /api/overpass?data=… (Vercel отдаёт декодированный query)
  if (req.query && typeof req.query.data === 'string' && req.query.data) {
    return req.query.data;
  }
  // POST: body может быть уже распарсен Vercel'ом (строка или объект)
  if (typeof req.body === 'string') return parseForm(req.body);
  if (req.body && typeof req.body === 'object' && typeof req.body.data === 'string') {
    return req.body.data;
  }
  // иначе — сырой поток (на случай, если парсер не сработал)
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      if (raw.length < MAX_RAW_BODY) raw += c;
    });
    req.on('end', () => resolve(raw ? parseForm(raw) : null));
    req.on('error', () => resolve(null));
  });
}

function sendJson(res, status, payload, extraHeaders) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  }
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (isRateLimited(clientIp(req))) {
    sendJson(res, 429, { error: 'rate_limited' }, { 'Retry-After': '60' });
    return;
  }

  const query = await extractQuery(req);
  if (!query || query.length > MAX_QUERY_LEN || !query.includes('[out:')) {
    sendJson(res, 400, { error: 'bad_query' });
    return;
  }

  const payload = 'data=' + encodeURIComponent(query);
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let rateStatus = 0; // 429/406 от любого зеркала — важнее прочего
  let badStatus = 0; // прочие 4xx (например, неверный запрос у зеркала)

  for (const mirror of MIRRORS) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    try {
      // Без кастомного User-Agent: зеркала фильтруют нестандартные UA —
      // проверено замером 16.10.2026, «KartaAD/2.0» давал 406 на api.de
      // и 403 «whitelisted usages» на openstreetmap.fr, а без UA оба
      // отвечали 200 с данными. Стандартный UA запроса обязан остаться
      // дефолтным (браузерный/undici) — его зеркала принимают.
      const resp = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
        signal: AbortSignal.timeout(Math.min(PER_MIRROR_TIMEOUT_MS, left)),
      });
      if (resp.status === 429 || resp.status === 406) {
        rateStatus = resp.status;
        await sleep(RATE_BACKOFF_MS);
        continue;
      }
      if (!resp.ok) {
        if (resp.status >= 400 && resp.status < 500) badStatus = resp.status;
        continue;
      }
      const text = await resp.text();
      try {
        JSON.parse(text);
      } catch {
        continue; // не JSON (страница ошибки с 200) — берём следующее зеркало
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(text);
      return;
    } catch {
      continue; // таймаут/сеть — пробуем следующее зеркало
    }
  }

  const status = rateStatus || (badStatus >= 400 && badStatus < 500 ? badStatus : 502);
  sendJson(res, status, { error: 'overpass_unavailable' },
    status === 429 || status === 406 ? { 'Retry-After': '60' } : undefined);
}
