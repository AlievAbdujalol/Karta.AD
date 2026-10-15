import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  POST_CATEGORIES,
  POST_STATUSES,
  REPORT_REASONS,
  PHOTO_LIMITS,
  TICKET_LIMITS,
  POST_LIMITS,
} from '@/lib/supportConfig';

/**
 * Паритет «клиент ↔ миграция» и статические проверки безопасности.
 * Единственный источник истины — файл миграции; тест читает его напрямую,
 * поэтому расхождение констант или потерянная политика роняет сборку.
 */

const MIGRATION = path.join(
  process.cwd(),
  'supabase/migrations/20261015120000_community_support.sql'
);
const sql = fs.readFileSync(MIGRATION, 'utf8');

function tableBlock(table) {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
  if (start < 0) throw new Error(`Таблица ${table} не найдена в миграции`);
  const next = sql.indexOf('CREATE TABLE IF NOT EXISTS public.', start + 1);
  return sql.slice(start, next < 0 ? undefined : next);
}

function checkValues(block, column) {
  const re = new RegExp(
    `${column}\\s+TEXT NOT NULL(?: DEFAULT '[^']*')? CHECK \\(${column} IN \\(([^)]+)\\)\\)`
  );
  const m = block.match(re);
  if (!m) return null;
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
}

function between(text, exprRe) {
  const re = new RegExp(`${exprRe}[^\\n)]{0,60}BETWEEN (\\d+) AND (\\d+)`);
  const m = text.match(re);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

describe('паритет констант с миграцией 20261015120000_community_support.sql', () => {
  it('категории обращений совпадают с CHECK support_tickets.category', () => {
    expect(checkValues(tableBlock('support_tickets'), 'category')).toEqual(TICKET_CATEGORIES);
  });

  it('статусы обращений совпадают с CHECK support_tickets.status', () => {
    expect(checkValues(tableBlock('support_tickets'), 'status')).toEqual(TICKET_STATUSES);
  });

  it('категории публикаций совпадают с CHECK community_posts.category', () => {
    expect(checkValues(tableBlock('community_posts'), 'category')).toEqual(POST_CATEGORIES);
  });

  it('статусы публикаций совпадают с CHECK community_posts.status', () => {
    expect(checkValues(tableBlock('community_posts'), 'status')).toEqual(POST_STATUSES);
  });

  it('причины жалоб совпадают с CHECK community_reports.reason', () => {
    expect(checkValues(tableBlock('community_reports'), 'reason')).toEqual(REPORT_REASONS);
  });

  it('MIME фото совпадают с CHECK ticket_photos.mime_type', () => {
    expect(checkValues(tableBlock('ticket_photos'), 'mime_type')).toEqual(PHOTO_LIMITS.mimeTypes);
  });

  it('лимит размера фото совпадает (5 МБ)', () => {
    const block = tableBlock('ticket_photos');
    const m = block.match(/size_bytes\s+INTEGER NOT NULL CHECK \(size_bytes BETWEEN (\d+) AND (\d+)\)/);
    expect(m).toBeTruthy();
    expect(Number(m[2])).toBe(PHOTO_LIMITS.maxSizeBytes);
  });

  it('лимит фото на публикацию — 4 и в триггере, и в RPC', () => {
    expect(PHOTO_LIMITS.maxCount).toBe(4);
    expect(sql).toMatch(/community_photos_limit[\s\S]*>= 4/);
    expect(sql).toMatch(/v_n NOT BETWEEN 0 AND 4/);
    expect(sql).toMatch(/Не больше 4 фотографий на публикацию/);
  });

  it('длины темы/описания обращения совпадают с RPC support_create_ticket', () => {
    expect(between(sql, 'char_length\\(btrim\\(p_subject\\)\\)')).toEqual([
      TICKET_LIMITS.subjectMin,
      TICKET_LIMITS.subjectMax,
    ]);
    expect(between(sql, 'char_length\\(btrim\\(p_body\\)\\)')).toEqual([
      TICKET_LIMITS.bodyMin,
      TICKET_LIMITS.bodyMax,
    ]);
  });

  it('длины заголовка/текста публикации совпадают с CHECK community_posts', () => {
    const block = tableBlock('community_posts');
    expect(between(block, 'char_length\\(btrim\\(title\\)\\)')).toEqual([
      POST_LIMITS.titleMin,
      POST_LIMITS.titleMax,
    ]);
    expect(between(block, 'char_length\\(btrim\\(body\\)\\)')).toEqual([
      POST_LIMITS.bodyMin,
      POST_LIMITS.bodyMax,
    ]);
  });

  it('бакеты: community-photos публичный, support-photos приватный, оба с лимитом 5 МБ', () => {
    expect(sql).toMatch(
      /'community-photos', 'community-photos', true,\s*5242880/
    );
    expect(sql).toMatch(
      /'support-photos', 'support-photos', false,\s*5242880/
    );
  });
});

describe('безопасность схемы (статические проверки миграции)', () => {
  const TABLES = [
    'support_developers',
    'community_posts',
    'community_comments',
    'community_reactions',
    'community_reports',
    'community_photos',
    'support_tickets',
    'support_messages',
    'developer_notes',
    'ticket_photos',
  ];

  it('на всех 10 новых таблицах включён RLS', () => {
    for (const t of TABLES) {
      const re = new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY;`);
      expect(re.test(sql), `RLS не включена на ${t}`).toBe(true);
    }
  });

  it('на support_developers нет клиентских INSERT/UPDATE/DELETE-политик', () => {
    const start = sql.indexOf('ON public.support_developers');
    const policies = [...sql.matchAll(/CREATE POLICY "([^"]+)" ON public\.support_developers\s+FOR (\w+)/g)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, , cmd] of policies) {
      expect(['INSERT', 'UPDATE', 'DELETE']).not.toContain(cmd);
    }
    expect(start).toBeGreaterThan(-1);
    expect(policies.every(([, , cmd]) => cmd === 'SELECT')).toBe(true);
  });

  it('developer_notes читаются только разработчиками', () => {
    expect(sql).toMatch(
      /CREATE POLICY "developer_notes_select" ON public\.developer_notes\s+FOR SELECT TO authenticated\s+USING \(public\.is_support_developer\(\)\)/
    );
  });

  it('RPC атомарны (SECURITY DEFINER + закреплённый search_path)', () => {
    for (const fn of ['support_create_ticket', 'support_reply', 'support_mark_read']) {
      const idx = sql.indexOf(`FUNCTION public.${fn}(`);
      expect(idx, `RPC ${fn} не найден`).toBeGreaterThan(-1);
      const body = sql.slice(idx, idx + 2500);
      expect(body).toContain('SECURITY DEFINER');
      expect(body).toContain("SET search_path = ''");
    }
  });

  it('идемпотентность защищена уникальными индексами по client_msg_id', () => {
    expect(sql).toMatch(/ux_support_tickets_client_msg[\s\S]{0,120}client_msg_id/);
    expect(sql).toMatch(/ux_support_messages_client_msg[\s\S]{0,160}client_msg_id/);
    expect(sql).toContain('EXCEPTION WHEN unique_violation');
  });

  it('в миграции нет обходов RLS и доступа anon', () => {
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/\bGRANT\b/);
    expect(sql).not.toMatch(/\bBYPASSRLS\b/);
    expect(sql).not.toMatch(/TO\s+anon\b/);
    expect(sql).not.toMatch(/TO\s+service_role\b/);
  });

  it('названия bucket, из которых читает клиент, совпадают с конфигом', () => {
    expect(PHOTO_LIMITS.buckets.community).toBe('community-photos');
    expect(PHOTO_LIMITS.buckets.support).toBe('support-photos');
  });
});
