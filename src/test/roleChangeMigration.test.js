/**
 * Регресс: request_role_change должна снимать БЕЙДЖ обоих триггеров.
 *
 * Прод-баг: при выборе роли «Бизнес» (1000 TJS) вылетал тост
 * «Баланс, подписку и статус водителя меняет только администратор».
 * Функция выставляла app.role_change_ok (триггер роли), но не
 * app.money_change_ok (триггер protect_profile_money на balance /
 * subscription_* / driver_status), поэтому платные роли не включались.
 *
 * Тест читает последнюю по имени миграцию, где определена функция:
 * CREATE OR REPLACE FUNCTION ... request_role_change, и проверяет,
 * что в ней есть оба set_config и тариф «Бизнес».
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

function latestRoleChangeDefinition() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  let sql = null;
  for (const file of files) {
    const content = fs.readFileSync(path.join(DIR, file), 'utf8');
    if (/FUNCTION\s+public\.request_role_change/i.test(content)) sql = content;
  }
  return sql;
}

describe('миграции: request_role_change', () => {
  it('снимает флаги триггеров роли и денег, иначе платные роли падают', () => {
    const sql = latestRoleChangeDefinition();
    expect(sql, 'нет миграции с определением request_role_change').toBeTruthy();

    expect(sql).toMatch(/set_config\('app\.role_change_ok',\s*'1',\s*true\)/);
    expect(sql).toMatch(/set_config\('app\.money_change_ok',\s*'1',\s*true\)/);
  });

  it('тариф «Бизнес» остаётся 1000 TJS', () => {
    const sql = latestRoleChangeDefinition();
    expect(sql).toMatch(/db_role = 'business'[\s\S]{0,80}fee := 1000/);
  });
});
