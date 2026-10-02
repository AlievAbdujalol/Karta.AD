/**
 * userKeys.js — личные API-ключи пользователя (OpenRouter, Gemini).
 * Каждый вводит СВОЙ ключ в Профиле; хранится в user_api_keys (RLS: только свои).
 * Приоритет ключа: личный из БД → общий из .env (фолбэк).
 */
import { supabase } from '@/api/supabase';

export const KEY_PROVIDERS = ['openrouter', 'gemini'];

const memCache = {}; // provider -> key
let cacheUserId = null;

function lsKey(userId) {
  return `karta_api_keys_${userId}`;
}

function readLocal(userId) {
  try {
    return JSON.parse(localStorage.getItem(lsKey(userId)) || '{}');
  } catch {
    return {};
  }
}

function writeLocal(userId, keys) {
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(keys));
  } catch {}
}

/** Загрузить ключи пользователя из БД в кэш. */
export async function loadUserKeys(userId) {
  if (!userId) return {};
  if (cacheUserId !== userId) {
    cacheUserId = userId;
    Object.keys(memCache).forEach((k) => delete memCache[k]);
    Object.assign(memCache, readLocal(userId));
  }
  try {
    const { data, error } = await supabase
      .from('user_api_keys')
      .select('provider, api_key')
      .eq('user_id', userId);
    if (!error && data) {
      Object.keys(memCache).forEach((k) => delete memCache[k]);
      data.forEach((r) => {
        if (r.provider && r.api_key) memCache[r.provider] = r.api_key;
      });
      writeLocal(userId, { ...memCache });
    }
  } catch {}
  return { ...memCache };
}

/** Синхронно взять ключ: личный → env-фолбэк. */
export function getApiKey(provider, envFallback = '') {
  return (memCache[provider] || '').trim() || (envFallback || '').trim() || null;
}

/** Есть ли личный ключ (без учёта env). */
export function hasOwnKey(provider) {
  return !!(memCache[provider] || '').trim();
}

/** Маскированный хвост для отображения: ••••abcd */
export function maskKey(key) {
  const k = (key || '').trim();
  if (!k) return '';
  return `••••${k.slice(-4)}`;
}

/** Сохранить/обновить личный ключ. */
export async function saveUserKey(userId, provider, key) {
  const clean = (key || '').trim();
  if (!clean) throw new Error('Пустой ключ');
  const { error } = await supabase.from('user_api_keys').upsert(
    { user_id: userId, provider, api_key: clean, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,provider' },
  );
  if (error) throw error;
  memCache[provider] = clean;
  writeLocal(userId, { ...memCache });
}

/** Удалить личный ключ (откат на общий env). */
export async function deleteUserKey(userId, provider) {
  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) throw error;
  delete memCache[provider];
  writeLocal(userId, { ...memCache });
}

/** Сбросить кэш (при выходе). */
export function clearKeyCache() {
  cacheUserId = null;
  Object.keys(memCache).forEach((k) => delete memCache[k]);
}
