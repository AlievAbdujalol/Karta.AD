/**
 * siteImages.js — загрузка картинок для AI-сайтов в Storage (bucket site-images).
 * Путь: {userId}/{uuid}.ext — писать может только владелец папки.
 */
import { supabase } from '@/api/supabase';

const BUCKET = 'site-images';
const MAX_SIZE = 5 * 1024 * 1024;

/** Загрузить файл, вернуть публичный URL. */
export async function uploadSiteImage(file, userId) {
  if (!file) throw new Error('Нет файла');
  if (!file.type.startsWith('image/')) throw new Error('Выбери файл-картинку');
  if (file.size > MAX_SIZE) throw new Error('Фото больше 5 МБ');
  if (!userId) throw new Error('Войди в аккаунт');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 4).replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Удалить файл по публичному URL (best effort). */
export async function deleteSiteImage(url) {
  if (!url) return;
  const i = url.indexOf(`${BUCKET}/`);
  if (i < 0) return;
  const path = url.slice(i + BUCKET.length + 1);
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {}
}
