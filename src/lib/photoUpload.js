/**
 * photoUpload.js — клиентская загрузка фото для сообщества и обращений.
 *
 * Файл проверяется ДО загрузки по магическим байтам (не по MIME из браузера):
 * JPEG · FF D8 FF, PNG · 89 50 4E 47 0D 0A 1A 0A, WebP · RIFF....WEBP.
 * После загрузки сервер перепроверяет файл по storage.objects (is_valid_photo)
 * и отклонит чужую папку/расширение/размер — клиентская проверка только для
 * скорого фидбэка, доверия к ней нет.
 *
 * Путь: {userId}/{uuid}.{ext} — писать можно только в свою папку (RLS bucket).
 */
import { supabase } from '@/api/supabase';
import { PHOTO_LIMITS, SIGNED_URL_TTL_SECONDS } from './supportConfig';

/** Расширение по MIME. */
export function extensionForMime(mime) {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

/**
 * Определяет MIME по магическим байтам.
 * @param {Uint8Array} bytes — минимум 12 байт начала файла
 * @returns {'image/jpeg'|'image/png'|'image/webp'|null}
 */
export function sniffImageMime(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (riff && webp) return 'image/webp';
  return null;
}

/** Расширение файла из его имени (нижний регистр, без точки). */
export function extensionOfName(name = '') {
  const dot = String(name).lastIndexOf('.');
  return dot >= 0 ? String(name).slice(dot + 1).toLowerCase() : '';
}

/**
 * Проверка фото по сырым данным.
 * @param {{ bytes: Uint8Array, size: number, name?: string }} input
 * @returns {{ ok: boolean, mime: string|null, error: string|null }}
 *          error: 'too_big' | 'empty' | 'bad_type'
 */
export function validatePhotoBytes({ bytes, size, name = '' }) {
  if (!Number.isFinite(size) || size <= 0) return { ok: false, mime: null, error: 'empty' };
  if (size > PHOTO_LIMITS.maxSizeBytes) return { ok: false, mime: null, error: 'too_big' };

  const sniffed = sniffImageMime(bytes);
  if (!sniffed) return { ok: false, mime: null, error: 'bad_type' };

  const ext = extensionOfName(name);
  const allowed = PHOTO_LIMITS.extensions;
  if (ext && !allowed.includes(ext)) return { ok: false, mime: sniffed, error: 'bad_type' };

  return { ok: true, mime: sniffed, error: null };
}

/** Читает первые 12 байт File/Blob (фолбэк на FileReader для jsdom/старых браузеров). */
export async function readMagicBytes(file) {
  const slice = file.slice(0, 12);
  if (typeof slice.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Полная проверка файла: магические байты + размер + расширение.
 * @param {File} file
 * @returns {Promise<{ ok: boolean, mime: string|null, error: string|null }>}
 */
export async function validatePhotoFile(file) {
  let bytes;
  try {
    bytes = await readMagicBytes(file);
  } catch {
    return { ok: false, mime: null, error: 'bad_type' };
  }
  return validatePhotoBytes({ bytes, size: file.size, name: file.name });
}

/** Целевой путь в бакете: {userId}/{uuid}.{ext}. */
export function buildPhotoPath(userId, mime, id) {
  const ext = extensionForMime(mime);
  if (!userId || !ext) return null;
  const uuid = id || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return `${userId}/${uuid}.${ext}`;
}

/**
 * Загрузка одного файла. Бросает Error с сообщением для тоста.
 * Возвращает { path, mime, size } — путь готов к передаче в RPC/вставке строки.
 * @param {File} file
 * @param {string} bucket
 * @param {string} userId
 */
export async function uploadPhoto(file, bucket, userId) {
  const check = await validatePhotoFile(file);
  if (!check.ok) {
    const err = new Error(check.error);
    err.code = check.error;
    throw err;
  }
  const path = buildPhotoPath(userId, check.mime);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: check.mime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { path, mime: check.mime, size: file.size };
}

/** Публичная URL для фото сообщества (bucket community-photos — public). */
export function publicPhotoUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

/** Временная подписанная ссылка на фото обращения (приватный bucket). */
export async function signedPhotoUrl(path, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
  const { data, error } = await supabase.storage
    .from(PHOTO_LIMITS.buckets.support)
    .createSignedUrl(path, ttlSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Моментальное состояние списка фото: можно ли отправлять форму.
 * Пока хоть одно фото грузится или упало с ошибкой — отправка блокируется,
 * чтобы не создать «успешное» обращение/публикацию без (или с битыми) фото.
 * @param {Array<{ status: string }>} photos
 */
export function arePhotosSettled(photos = []) {
  return photos.every(p => p && p.status === 'ready');
}
