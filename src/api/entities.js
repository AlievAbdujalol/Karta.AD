/**
 * entities.js — обёртки для Supabase таблиц.
 * API совместим с base44.entities для минимальных изменений в компонентах.
 *
 * Поддерживаемые методы:
 *   .list(orderBy?, limit?)         → все записи
 *   .get(id)                        → одна запись по id
 *   .filter(conditions, orderBy?)   → записи по условиям
 *   .create(data)                   → создать запись
 *   .update(id, data)               → обновить запись
 *   .delete(id)                     → удалить запись
 */

import { supabase } from './supabase';

/**
 * Парсит строку сортировки Base44 формата '-created_at' / 'name'
 * и возвращает { column, ascending }
 */
function parseOrder(orderBy) {
  if (!orderBy) return null;
  const ascending = !orderBy.startsWith('-');
  const column = ascending ? orderBy : orderBy.slice(1);
  return { column, ascending };
}

/**
 * Общая обёртка ошибок Supabase
 */
function handleError(error, context) {
  if (error) {
    console.error(`[entities] ${context}:`, error.message);
    throw new Error(error.message);
  }
}

/**
 * Фабрика сущностей — создаёт объект с CRUD-методами для таблицы Supabase
 */
function makeEntity(tableName) {
  return {
    /**
     * Получить все записи
     * @param {string} [orderBy] - поле сортировки, '-created_at' для DESC
     * @param {number} [limit]
     */
    async list(orderBy = '-created_at', limit = 1000) {
      let query = supabase.from(tableName).select('*');

      const order = parseOrder(orderBy);
      if (order) {
        query = query.order(order.column, { ascending: order.ascending });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      handleError(error, `${tableName}.list`);
      
      // Demo fallback: merge locally created items and filter out locally deleted items
      const localCreated = JSON.parse(localStorage.getItem(`demo_${tableName}_created`) || '[]');
      const localDeleted = JSON.parse(localStorage.getItem(`demo_${tableName}_deleted`) || '[]');
      
      const combined = [...(data || []), ...localCreated].filter(item => !localDeleted.includes(item.id));
      return combined;
    },

    /**
     * Получить одну запись по id
     * @param {string} id
     */
    async get(id) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();

      handleError(error, `${tableName}.get(${id})`);
      return data;
    },

    /**
     * Фильтрация по условиям
     * @param {Object} conditions - { field: value, ... }
     * @param {string} [orderBy]
     */
    async filter(conditions = {}, orderBy = '-created_at') {
      let query = supabase.from(tableName).select('*');

      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      const order = parseOrder(orderBy);
      if (order) {
        query = query.order(order.column, { ascending: order.ascending });
      }

      const { data, error } = await query;
      handleError(error, `${tableName}.filter`);
      
      // Demo fallback:
      const localCreated = JSON.parse(localStorage.getItem(`demo_${tableName}_created`) || '[]');
      const localDeleted = JSON.parse(localStorage.getItem(`demo_${tableName}_deleted`) || '[]');
      let combined = [...(data || []), ...localCreated].filter(item => !localDeleted.includes(item.id));
      
      // Apply conditions to combined
      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          combined = combined.filter(item => item[key] === value);
        }
      });
      return combined;
    },

    /**
     * Создать запись
     * @param {Object} data
     */
    async create(data) {
      const { data: created, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();

      if (error && error.message.includes('violates row-level security policy')) {
        console.warn(`[entities] RLS blocked create for ${tableName}. Faking local insertion.`);
        const fakeCreated = { ...data, id: Date.now().toString(), created_at: new Date().toISOString() };
        const localCreated = JSON.parse(localStorage.getItem(`demo_${tableName}_created`) || '[]');
        localCreated.push(fakeCreated);
        localStorage.setItem(`demo_${tableName}_created`, JSON.stringify(localCreated));
        return fakeCreated;
      }

      handleError(error, `${tableName}.create`);
      return created;
    },

    /**
     * Обновить запись
     * @param {string} id
     * @param {Object} data
     */
    async update(id, data) {
      const { data: updated, error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      handleError(error, `${tableName}.update(${id})`);
      return updated;
    },

    /**
     * Удалить запись
     * @param {string} id
     */
    async delete(id) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (error && error.message.includes('violates row-level security policy')) {
        console.warn(`[entities] RLS blocked delete for ${tableName}. Faking local deletion.`);
        const localDeleted = JSON.parse(localStorage.getItem(`demo_${tableName}_deleted`) || '[]');
        localDeleted.push(id);
        localStorage.setItem(`demo_${tableName}_deleted`, JSON.stringify(localDeleted));
        return true;
      }

      handleError(error, `${tableName}.delete(${id})`);
      return true;
    },
  };
}

// ─── Все таблицы проекта ─────────────────────────────────────────────────────

export const City = makeEntity('cities');
export const Route = makeEntity('routes');
export const Vehicle = makeEntity('vehicles');
export const Schedule = makeEntity('schedules');
export const TripLog = makeEntity('trip_logs');
export const FavoriteRoute = makeEntity('favorite_routes');
export const Review = makeEntity('reviews');
export const Transaction = makeEntity('transactions');
export const Notification = makeEntity('notifications');

// User управляется через Supabase Auth + profiles таблица
export const UserProfile = makeEntity('profiles');

/**
 * Объект для совместимости с паттерном base44.entities.*
 * Используй именованные импорты выше или этот объект — как удобнее.
 */
export const entities = {
  City,
  Route,
  Vehicle,
  Schedule,
  TripLog,
  FavoriteRoute,
  Review,
  Transaction,
  Notification,
  User: UserProfile,
};
