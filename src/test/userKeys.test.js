import { describe, it, expect, vi, beforeEach } from 'vitest';

// Состояние БД для мока supabase (hoisted — фабрика vi.mock вызывается до тела модуля)
const db = vi.hoisted(() => {
  const state = { rows: [], upserted: null, deleted: false };
  const table = {
    select: () => table,
    delete: () => { state.deleted = true; return table; },
    eq: () => table,
    upsert: async (row) => { state.upserted = row; return { error: null }; },
    then: (onF, onR) => Promise.resolve({ data: state.rows, error: null }).then(onF, onR),
  };
  return { state, table };
});

vi.mock('@/api/supabase', () => ({
  supabase: { from: () => db.table },
}));

import {
  getOwnKey,
  getApiKey,
  hasOwnKey,
  loadUserKeys,
  saveUserKey,
  deleteUserKey,
  clearKeyCache,
} from '../lib/userKeys';

describe('userKeys — личные ключи и показ владельцу', () => {
  beforeEach(() => {
    clearKeyCache();
    localStorage.clear();
    db.state.rows = [];
    db.state.upserted = null;
    db.state.deleted = false;
  });

  it('getOwnKey: пусто без загрузки', () => {
    expect(getOwnKey('openrouter')).toBeNull();
    expect(hasOwnKey('openrouter')).toBe(false);
  });

  it('getOwnKey не подставляет env-фолбэк (показывать можно только своё)', () => {
    expect(getApiKey('openrouter', 'env-key')).toBe('env-key');
    expect(getOwnKey('openrouter')).toBeNull();
    expect(hasOwnKey('openrouter')).toBe(false);
  });

  it('после loadUserKeys возвращает только личный ключ', async () => {
    db.state.rows = [{ provider: 'openrouter', api_key: 'sk-or-v1-fa55fdd88' }];
    await loadUserKeys('u1');
    expect(getOwnKey('openrouter')).toBe('sk-or-v1-fa55fdd88');
    expect(getOwnKey('gemini')).toBeNull();
    expect(getApiKey('openrouter', 'env-key')).toBe('sk-or-v1-fa55fdd88');
  });

  it('saveUserKey → getOwnKey отдаёт сохранённое', async () => {
    await saveUserKey('u1', 'gemini', 'AQ.test-key');
    expect(getOwnKey('gemini')).toBe('AQ.test-key');
    expect(hasOwnKey('gemini')).toBe(true);
  });

  it('deleteUserKey убирает показ', async () => {
    await saveUserKey('u1', 'openrouter', 'sk-or-v1-x');
    await deleteUserKey('u1', 'openrouter');
    expect(getOwnKey('openrouter')).toBeNull();
    expect(db.state.deleted).toBe(true);
  });

  it('пустой ключ не сохраняется', async () => {
    await expect(saveUserKey('u1', 'openrouter', '  ')).rejects.toThrow('Пустой ключ');
  });
});
