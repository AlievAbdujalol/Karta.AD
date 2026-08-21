/**
 * useEntityList — хук для загрузки списка записей из Supabase таблицы.
 * Совместим с паттерном, использовавшимся в Base44.
 *
 * @param {string} entityName - имя сущности (City, Route, Vehicle, etc.)
 * @param {Object} [conditions] - фильтр { field: value }
 * @param {string} [orderBy] - '-created_at' для DESC
 */

import { useState, useEffect } from 'react';
import { entities } from '@/api/entities';

export function useEntityList(entityName, conditions = {}, orderBy = '-created_at') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const entity = entities[entityName];

  const load = async () => {
    if (!entity) {
      console.error(`[useEntityList] Unknown entity: ${entityName}`);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const hasConditions = Object.keys(conditions).length > 0;
      const result = hasConditions
        ? await entity.filter(conditions, orderBy)
        : await entity.list(orderBy);
      setData(result);
    } catch (err) {
      console.error(`[useEntityList] Error loading ${entityName}:`, err.message);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
   
  }, [entityName, JSON.stringify(conditions)]);

  return { data, loading, error, refetch: load };
}
