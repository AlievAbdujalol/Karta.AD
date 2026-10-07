/**
 * api/website.js — фасад настроек сайта и публичной витрины (§10: /api/website).
 * website_settings: одна строка на бизнес (RLS через business_role()).
 * getPublicStore: анонимный RPC — опубликованный HTML по slug.
 */
import { supabase } from '@/api/supabase';

const SETTINGS_COLUMNS = 'business_id, site_type, style, hero_title, hero_description, logo_url, font, socials, show_delivery, show_payment, delivery, payment, prompt';

/** Настройки сайта бизнеса; null — ещё не создавались. */
export async function getWebsiteSettings(businessId) {
  const { data, error } = await supabase
    .from('website_settings')
    .select(SETTINGS_COLUMNS)
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw new Error(`getWebsiteSettings: ${error.message}`);
  return data;
}

/** Upsert настроек сайта (insert или update по business_id). */
export async function saveWebsiteSettings(settings) {
  if (!settings?.business_id) throw new Error('saveWebsiteSettings: нет business_id');
  const { data, error } = await supabase
    .from('website_settings')
    .upsert(settings, { onConflict: 'business_id' })
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw new Error(`saveWebsiteSettings: ${error.message}`);
  return data;
}

/**
 * Опубликовать версию проекта и гарантировать slug.
 * Возвращает { slug } — публичный адрес /store/<slug>.
 */
export async function publishProject(projectId, versionId) {
  const { error: unpublishErr } = await supabase
    .from('ai_project_versions')
    .update({ is_published: false })
    .eq('project_id', projectId);
  if (unpublishErr) throw new Error(`publishProject: ${unpublishErr.message}`);

  const { data: version, error: pubErr } = await supabase
    .from('ai_project_versions')
    .update({ is_published: true })
    .eq('id', versionId)
    .select('project_id')
    .single();
  if (pubErr) throw new Error(`publishProject: ${pubErr.message}`);

  // slug генерирует триггер BEFORE UPDATE OF name, slug — трогаем строку
  const { data: project, error: projErr } = await supabase
    .from('ai_projects')
    .select('slug')
    .eq('id', version.project_id)
    .single();
  if (projErr) throw new Error(`publishProject: ${projErr.message}`);

  let slug = project.slug;
  if (!slug) {
    const { data: touched, error: touchErr } = await supabase
      .from('ai_projects')
      .update({ slug: null })
      .eq('id', version.project_id)
      .select('slug')
      .single();
    if (touchErr) throw new Error(`publishProject: ${touchErr.message}`);
    slug = touched.slug;
  }
  return { slug };
}

/**
 * Публичная витрина по slug (анон): { html, files, name } | null.
 * Используется страницей /store/:slug.
 */
export async function getPublicStore(slug) {
  if (!slug) return null;
  const { data, error } = await supabase.rpc('get_public_store', { p_slug: slug });
  if (error) throw new Error(`getPublicStore: ${error.message}`);
  return data || null;
}
