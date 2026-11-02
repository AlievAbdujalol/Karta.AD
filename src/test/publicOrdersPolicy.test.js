/**
 * Регресс: публичный чекаут не должен писать в orders/order_items напрямую.
 *
 * Прод-риск: политики orders_insert_public / order_items_insert_public давали
 * роли anon прямой INSERT в обход RPC create_store_order — с обходом
 * rate-limit и произвольным delivery_price. Миграция
 * 20261102020000_harden_public_orders.sql удаляет обе политики; RPC
 * create_store_order (SECURITY DEFINER) остаётся доступной anon.
 *
 * Тест статический: CI не подключается к прод-БД, поэтому проверяем, что
 * последняя миграция, упоминающая политику, именно удаляет её, а не создаёт.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

function migrations() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(DIR, file), 'utf8') }));
}

function latestMention(policy) {
  const re = new RegExp(`\\b${policy}\\b`);
  return migrations().filter((m) => re.test(m.sql)).at(-1) || null;
}

describe('RLS: публичные заказы', () => {
  it.each(['orders_insert_public', 'order_items_insert_public'])(
    'последняя миграция с %s удаляет политику',
    (policy) => {
      const last = latestMention(policy);
      expect(last, `нет миграции, упоминающей ${policy}`).toBeTruthy();
      expect(last.sql).toMatch(new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.`));
    },
  );

  it('публичный RPC create_store_order не отзывается у anon', () => {
    const revoke = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_store_order/i;
    expect(migrations().some((m) => revoke.test(m.sql))).toBe(false);
  });
});

describe('RLS: такси', () => {
  it('один активный заказ на пассажира закрыт частичным уникальным индексом', () => {
    const last = latestMention('taxi_orders_one_active_per_passenger');
    expect(last, 'нет миграции с индексом активного заказа').toBeTruthy();
    expect(last.sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS taxi_orders_one_active_per_passenger/);
    // arrived — тоже активный статус: пассажир в машине, но заказ не завершён.
    expect(last.sql).toMatch(/WHERE status IN \('searching', 'found', 'en_route', 'arrived', 'riding'\)/);
  });

  it('цена проверяется и на INSERT, а не только на UPDATE', () => {
    const last = latestMention('protect_taxi_order_price');
    expect(last, 'нет миграции с protect_taxi_order_price').toBeTruthy();
    // Триггер должен стоять на INSERT (до фикса было только BEFORE UPDATE).
    expect(last.sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.taxi_orders/);
    // INSERT отклоняется, если цена ниже серверной границы.
    expect(last.sql).toMatch(/RAISE EXCEPTION 'price below route minimum'/);
    expect(last.sql).toMatch(/calculate_taxi_price\(COALESCE\(v_dist_km, 0\)/);
  });
});
