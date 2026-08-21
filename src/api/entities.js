import { supabase } from './supabase';

function handleError(error, context) {
  if (error) {
    console.error(`[entities] ${context}:`, error.message);
    throw new Error(error.message);
  }
}

function parseOrder(orderBy) {
  if (!orderBy) return null;
  const ascending = !orderBy.startsWith('-');
  const column = ascending ? orderBy : orderBy.slice(1);
  return { column, ascending };
}

function makeEntity(tableName) {
  return {
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
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      handleError(error, `${tableName}.get(${id})`);
      return data;
    },

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
      return data || [];
    },

    async create(data) {
      const { data: created, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      handleError(error, `${tableName}.create`);
      return created;
    },

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

    async delete(id) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      handleError(error, `${tableName}.delete(${id})`);
      return true;
    },
  };
}

export const City = makeEntity('cities');
export const Route = makeEntity('routes');
export const Vehicle = makeEntity('vehicles');
export const Schedule = makeEntity('schedules');
export const TripLog = makeEntity('trip_logs');
export const FavoriteRoute = makeEntity('favorite_routes');
export const FavoriteDriver = makeEntity('favorite_drivers');
export const Review = makeEntity('reviews');
export const Transaction = makeEntity('transactions');
export const Notification = makeEntity('notifications');
export const UserProfile = makeEntity('profiles');

export const entities = {
  City,
  Route,
  Vehicle,
  Schedule,
  TripLog,
  FavoriteRoute,
  FavoriteDriver,
  Review,
  Transaction,
  Notification,
  User: UserProfile,
};
