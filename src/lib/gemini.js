/**
 * gemini.js — лёгкий клиент Google Gemini (REST).
 * Ключ из VITE_GEMINI_API_KEY. Retry, ошибки, dev-логирование.
 */

const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1/models';
const IS_DEV = import.meta.env.DEV;

import { getApiKey as getUserApiKey } from './userKeys';

// ─── ошибки ────────────────────────────────────────────────────────────
export class GeminiError extends Error {
  constructor(message, status, type) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.type = type; // 'network' | 'auth' | 'rate' | 'model' | 'timeout' | 'unknown'
  }
}

function classifyError(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 404) return 'model';
  if (status >= 500) return 'server';
  return 'unknown';
}

// ─── ключ ──────────────────────────────────────────────────────────────
// Приоритет: личный ключ пользователя (Профиль → AI-ключи) → общий из .env
export function getGeminiKey() {
  return getUserApiKey('gemini', import.meta.env.VITE_GEMINI_API_KEY);
}

export function isGeminiConfigured() {
  return !!getGeminiKey();
}

// ─── helpers ───────────────────────────────────────────────────────────
function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function log(...args) {
  if (IS_DEV) console.log('[Gemini]', ...args);
}

// ─── основной вызов ────────────────────────────────────────────────────
/**
 * Сырой вызов generateContent.
 * @param {string} prompt
 * @param {object} opts
 * @param {string} opts.model - модель
 * @param {number} opts.timeoutMs - таймаут
 * @param {number} opts.temperature
 * @param {number} opts.maxTokens - макс. токенов ответа
 * @param {boolean} opts.jsonMode - вернуть JSON
 * @param {number} opts.retries - кол-во повторов при ошибках
 * @returns {Promise<string|null>} текст ответа или null
 */
export async function geminiGenerate(prompt, {
  model = DEFAULT_MODEL,
  timeoutMs = 20000,
  temperature = 0.1,
  maxTokens = 1024,
  jsonMode = true,
  retries = 2,
} = {}) {
  const key = getGeminiKey();
  if (!key) return null;

  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
      log(`retry #${attempt} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errType = classifyError(resp.status);
        const msg = `HTTP ${resp.status}`;
        log('error:', msg, errType);
        // не повторяем auth/404 ошибки
        if (errType === 'auth' || errType === 'model') {
          throw new GeminiError(msg, resp.status, errType);
        }
        lastError = new GeminiError(msg, resp.status, errType);
        continue; // retry
      }

      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts;
      if (!parts?.length) {
        log('empty response', data);
        return null;
      }
      const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
      if (!text) return null;

      log('response:', text.slice(0, 120) + (text.length > 120 ? '…' : ''));
      return text;
    } catch (err) {
      if (err instanceof GeminiError) throw err;
      const type = err.name === 'AbortError' ? 'timeout' : 'network';
      log('error:', err.message, type);
      lastError = new GeminiError(err.message, 0, type);
      if (type === 'timeout') continue; // retry timeout
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) throw lastError;
  return null;
}

// ─── structured output helper ──────────────────────────────────────────
/**
 * Вызывает Gemini и парсит JSON-ответ. Возвращает объект или null.
 */
export async function geminiJSON(prompt, opts = {}) {
  const raw = await geminiGenerate(prompt, { jsonMode: true, ...opts });
  return extractJson(raw);
}

// ─── поиск: разбор запроса ─────────────────────────────────────────────
const INTENT_PROMPT = (query, city = '') => `Ты парсер поисковых запросов транспортного приложения (Таджикистан).
${city ? `Город пользователя: ${city}.` : ''}
Верни СТРОГО JSON: {"action":"route|stop|place|address|help","routeNumber":null|string,"stopName":null|string,"place":null|string,"from":null|string,"to":null|string,"terms":[string],"suggestion":null|string}

Правила:
- action=route если просят маршрут/автобус/как доехать.
- action=help если здороваются или спрашивают "что умеешь"/"помощь".
- routeNumber — цифры/буквы ("66","8А").
- stopName — остановка, place — место (базар, больница), from/to — "от X до Y".
- terms — 2-4 ключевых слова для поиска (без предлогов).
- suggestion — подсказка-уточнение если запрос двусмысленный (иначе null).
- Пустые поля = null. terms всегда непустой.
Запрос: "${query.replace(/"/g, '')}"`;

export async function parseSearchIntent(query, { city = '', timeoutMs = 10000 } = {}) {
  const q = (query || '').trim();
  if (!q || !isGeminiConfigured()) return null;
  const intent = await geminiJSON(INTENT_PROMPT(q, city), { timeoutMs, maxTokens: 256 });
  if (!intent || !Array.isArray(intent.terms) || !intent.terms.length) return null;
  return {
    action: ['route', 'stop', 'place', 'address', 'help'].includes(intent.action) ? intent.action : 'place',
    routeNumber: intent.routeNumber || null,
    stopName: intent.stopName || null,
    place: intent.place || null,
    from: intent.from || null,
    to: intent.to || null,
    suggestion: intent.suggestion || null,
    terms: [...new Set(intent.terms.map(t => String(t || '').trim()).filter(Boolean))].slice(0, 4),
  };
}
