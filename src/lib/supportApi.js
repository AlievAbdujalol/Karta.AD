/**
 * supportApi.js — доступ к данным раздела «Отзывы и поддержка».
 *
 * Правила:
 *  - личные обращения создаём ТОЛЬКО через RPC support_create_ticket (идемпотентно
 *    по client_msg_id), ответы — через support_reply: тип сообщения и отправитель
 *    определяются сервером, клиент их не подделывает;
 *  - статус/ответственного меняет только разработчик (RLS сам не даст, но код
 *    зовёт обновление только в панели разработчика);
 *  - internal-заметки (developer_notes) читаются только из панели разработчика;
 *  - photos в RPC — массив [{ path }] загруженных в bucket файлов.
 */
import { supabase } from '@/api/supabase';

function unwrap(result, context) {
  if (result?.error) {
    console.error(`[supportApi] ${context}:`, result.error.message);
    // Сырые коды Postgres пользователю не показываем — только понятный текст.
    const FRIENDLY = {
      '23502': 'Запрос отклонён сервером: не все данные заполнены',
      '42501': 'Недостаточно прав для этого действия',
      '23505': 'Такая запись уже существует',
      '22P02': 'Некорректные данные запроса',
    };
    throw new Error(FRIENDLY[result.error.code] || result.error.message || context);
  }
  return result?.data;
}

export function newClientMsgId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Является ли текущий пользователь разработчиком поддержки.
 * Источник истины — таблица support_developers (её нельзя изменить из API).
 * Сравнение с profiles.role НЕ используется: роль можно получить через
 * request_role_change, значению из профиля доверять нельзя.
 * @param {string} userId
 */
export async function isSupportDeveloper(userId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('support_developers')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// ─── Сообщество ──────────────────────────────────────────────────────────────

/** Лента опубликованных постов + фото. */
export async function fetchFeed(limit = 50) {
  const posts = unwrap(
    await supabase
      .from('community_posts')
      .select('*, community_photos(*)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit),
    'fetchFeed'
  );
  return posts || [];
}

/** Счётчики реакций + какие поставил я (два независимых запроса). */
export async function fetchReactions(postIds, userId) {
  const empty = { counts: {}, mine: {} };
  if (postIds.length === 0) return empty;
  const [all, my] = await Promise.all([
    supabase.from('community_reactions').select('post_id').in('post_id', postIds),
    supabase
      .from('community_reactions')
      .select('post_id')
      .in('post_id', postIds)
      .eq('user_id', userId),
  ]);
  if (all.error || my.error) {
    console.error('[supportApi] fetchReactions:', (all.error || my.error).message);
    return empty;
  }
  const counts = {};
  for (const r of all.data || []) counts[r.post_id] = (counts[r.post_id] || 0) + 1;
  const mine = {};
  for (const r of my.data || []) mine[r.post_id] = true;
  return { counts, mine };
}

/** Публикация поста. Успех → { post }. Фото вставляются отдельной строкой. */
export async function createPost({ authorId, category, title, body }) {
  const data = unwrap(
    await supabase
      .from('community_posts')
      .insert({ author_id: authorId, category, title, body, status: 'published' })
      .select()
      .single(),
    'createPost'
  );
  return data;
}

/** Строки фото к посту (сервер проверяет is_valid_photo и лимит 4). */
export async function createPostPhotos(postId, photos = [], owner) {
  if (photos.length === 0) return [];
  const rows = photos.map(p => ({
    post_id: postId,
    owner_id: owner,
    storage_path: p.path,
    mime_type: p.mime,
    size_bytes: p.size,
  }));
  return unwrap(
    await supabase.from('community_photos').insert(rows).select(),
    'createPostPhotos'
  );
}

/** Удаление своего поста (каскадом уйдут фото). */
export async function deletePost(postId) {
  unwrap(await supabase.from('community_posts').delete().eq('id', postId), 'deletePost');
}

/** Удаление загруженного в bucket файла (очистка при отмене выбора). */
export async function removeStoragePhoto(bucket, path) {
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) console.warn('[supportApi] removeStoragePhoto:', error.message);
  } catch (err) {
    console.warn('[supportApi] removeStoragePhoto:', err?.message || err);
  }
}

/** Комментарии поста. */
export async function fetchComments(postId) {
  const data = unwrap(
    await supabase
      .from('community_comments')
      .select('*')
      .eq('post_id', postId)
      .eq('status', 'published')
      .order('created_at', { ascending: true }),
    'fetchComments'
  );
  return data || [];
}

export async function addComment(postId, body, authorId) {
  return unwrap(
    await supabase
      .from('community_comments')
      .insert({ post_id: postId, author_id: authorId, body, status: 'published' })
      .select()
      .single(),
    'addComment'
  );
}

/** Переключение реакции «Полезно» (уникальность гарантирует БД). */
export async function setReaction(postId, userId, on) {
  if (on) {
    const { error } = await supabase
      .from('community_reactions')
      .insert({ post_id: postId, user_id: userId, kind: 'helpful' });
    if (error && error.code !== '23505') {
      console.error('[supportApi] setReaction:', error.message);
      throw new Error(error.message);
    }
    return;
  }
  unwrap(
    await supabase
      .from('community_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId),
    'setReaction'
  );
}

/** Жалоба на пост/комментарий (дубликат гасится UNIQUE). */
export async function reportTarget(targetType, targetId, reason, reporterId) {
  const { data, error } = await supabase
    .from('community_reports')
    .insert({ target_type: targetType, target_id: targetId, reason, reporter_id: reporterId })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return { already: true };
    console.error('[supportApi] reportTarget:', error.message);
    throw new Error(error.message);
  }
  return { already: false, row: data };
}

// ─── Обращения (пользователь) ────────────────────────────────────────────────

export async function fetchMyTickets() {
  const data = unwrap(
    await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false }),
    'fetchMyTickets'
  );
  return data || [];
}

export async function fetchTicketMessages(ticketId) {
  const data = unwrap(
    await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    'fetchTicketMessages'
  );
  return data || [];
}

export async function fetchTicketPhotos(ticketId) {
  const data = unwrap(
    await supabase.from('ticket_photos').select('*').eq('ticket_id', ticketId),
    'fetchTicketPhotos'
  );
  return data || [];
}

/** Создание обращения. Повтор с тем же client_msg_id вернёт уже созданное. */
export async function createTicket({ subject, category, body, photos = [], clientMsgId }) {
  const data = unwrap(
    await supabase.rpc('support_create_ticket', {
      p_subject: subject,
      p_category: category,
      p_body: body,
      p_photos: photos.map(p => ({ path: p.path })),
      p_client_msg_id: clientMsgId,
    }),
    'createTicket'
  );
  return data;
}
/** Ответ в обращении (тип «пользователь/разработчик» решает сервер). */
export async function replyToTicket(ticketId, body, photos = [], clientMsgId) {
  const data = unwrap(
    await supabase.rpc('support_reply', {
      p_ticket: ticketId,
      p_body: body,
      p_photos: photos.map(p => ({ path: p.path })),
      p_client_msg_id: clientMsgId,
    }),
    'replyToTicket'
  );
  return data;
}

/** Пометить ответы разработчиков в своём обращении прочитанными. */
export async function markTicketRead(ticketId) {
  const { data, error } = await supabase.rpc('support_mark_read', { p_ticket: ticketId });
  if (error) {
    console.error('[supportApi] markTicketRead:', error.message);
    return 0;
  }
  return data || 0;
}

/** Счётчик непрочитанных ответов разработчиков по моим обращениям (RLS). */
export async function fetchUnreadDevMessages() {
  const { data, error } = await supabase
    .from('support_messages')
    .select('ticket_id')
    .eq('message_type', 'developer')
    .is('read_at', null);
  if (error || !data) return {};
  const counts = {};
  for (const row of data) counts[row.ticket_id] = (counts[row.ticket_id] || 0) + 1;
  return counts;
}

// ─── Панель разработчика ─────────────────────────────────────────────────────

export async function fetchAllTickets(statusFilter = 'all') {
  let query = supabase
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);
  return unwrap(query, 'fetchAllTickets') || [];
}

export async function setTicketStatus(ticketId, status) {
  const data = unwrap(
    await supabase
      .from('support_tickets')
      .update({ status })
      .eq('id', ticketId)
      .select()
      .single(),
    'setTicketStatus'
  );
  return data;
}

export async function setTicketAssignee(ticketId, developerId) {
  const data = unwrap(
    await supabase
      .from('support_tickets')
      .update({ assigned_developer_id: developerId })
      .eq('id', ticketId)
      .select()
      .single(),
    'setTicketAssignee'
  );
  return data;
}

/** Разработчики (id нужны для показа ответственного; имён профилей не видно). */
export async function fetchDevelopers() {
  const data = unwrap(
    await supabase.from('support_developers').select('user_id').order('created_at'),
    'fetchDevelopers'
  );
  return (data || []).map(d => d.user_id);
}

export async function fetchNotes(ticketId) {
  const data = unwrap(
    await supabase
      .from('developer_notes')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false }),
    'fetchNotes'
  );
  return data || [];
}

export async function addNote(ticketId, developerId, body) {
  return unwrap(
    await supabase
      .from('developer_notes')
      .insert({ ticket_id: ticketId, developer_id: developerId, body })
      .select()
      .single(),
    'addNote'
  );
}

// ─── Realtime (опционально: сбой подписки не ломает страницу) ────────────────

/**
 * Подписка на postgres_changes. Возвращает канал или null — вызывающий
 * обязан работать и без realtime (данные подтягиваются при монтировании
 * и после каждого действия).
 */
export function subscribe(table, handler, filter) {
  try {
    const channel = supabase
      .channel(`support-${table}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, handler);
    channel.subscribe(status => {
      if (status === 'CHANNEL_ERROR') {
        console.warn(`[supportApi] realtime недоступна для ${table} — работаем без неё`);
      }
    });
    return channel;
  } catch (err) {
    console.warn(`[supportApi] подписка на ${table} не удалась:`, err?.message || err);
    return null;
  }
}

export function unsubscribe(channel) {
  if (!channel) return;
  try {
    supabase.removeChannel(channel);
  } catch {
    /* канал уже закрыт */
  }
}
