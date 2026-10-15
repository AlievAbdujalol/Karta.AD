import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * supportApi — контракт вставок/вызовов RPC.
 *
 * Критично: author_id / owner_id обязаны уходить в INSERT — RLS и NOT NULL
 * отклонят запись без них (ревью поставило это как CRITICAL). Здесь ловим
 * именно регрессию «клиент забыл передать владельца».
 */
const db = vi.hoisted(() => ({
  inserts: [],
  rpcs: [],
  update: null,
  deleted: null,
  nextResult: null,
}));

function makeBuilder(table) {
  const b = {
    insert(payload) {
      db.inserts.push({ table, payload });
      return b;
    },
    update(payload) {
      db.update = { table, payload };
      return b;
    },
    delete() {
      db.deleted = table;
      return b;
    },
    select() {
      return b;
    },
    single() {
      return b;
    },
    eq() {
      return b;
    },
    in() {
      return b;
    },
    is() {
      return b;
    },
    order() {
      return b;
    },
    limit() {
      return b;
    },
    then(resolve, reject) {
      const result = db.nextResult || { data: { id: 'row-1' }, error: null };
      db.nextResult = null;
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return b;
}

vi.mock('@/api/supabase', () => ({
  supabase: {
    from: vi.fn(table => makeBuilder(table)),
    rpc: vi.fn(async (name, args) => {
      db.rpcs.push({ name, args });
      return { data: { id: 'rpc-1' }, error: null };
    }),
    storage: {
      from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: null })) })),
    },
    channel: vi.fn(() => ({ on: vi.fn(() => ({})), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

import {
  createPost,
  createPostPhotos,
  addComment,
  createTicket,
  replyToTicket,
  fetchUnreadDevMessages,
  newClientMsgId,
} from '@/lib/supportApi';

beforeEach(() => {
  db.inserts.length = 0;
  db.rpcs.length = 0;
  db.update = null;
  db.deleted = null;
  db.nextResult = null;
  vi.clearAllMocks();
});

describe('supportApi — INSERT всегда несёт владельца', () => {
  it('createPost передаёт author_id и статус published', async () => {
    await createPost({ authorId: 'u1', category: 'routes', title: 'Маршрут 42', body: 'Отличный' });
    const call = db.inserts.find(c => c.table === 'community_posts');
    expect(call).toBeTruthy();
    expect(call.payload.author_id).toBe('u1');
    expect(call.payload.status).toBe('published');
    expect(call.payload.title).toBe('Маршрут 42');
  });

  it('createPostPhotos проставляет owner_id и post_id каждой строке', async () => {
    await createPostPhotos(
      'p1',
      [
        { path: 'u1/a.jpg', mime: 'image/jpeg', size: 100 },
        { path: 'u1/b.png', mime: 'image/png', size: 200 },
      ],
      'u1'
    );
    const call = db.inserts.find(c => c.table === 'community_photos');
    expect(call.payload).toHaveLength(2);
    for (const row of call.payload) {
      expect(row.owner_id).toBe('u1');
      expect(row.post_id).toBe('p1');
      expect(row.storage_path).toMatch(/^u1\//);
    }
    expect(call.payload[0].mime_type).toBe('image/jpeg');
    expect(call.payload[1].size_bytes).toBe(200);
  });

  it('createPostPhotos без фото не делает запрос', async () => {
    await createPostPhotos('p1', [], 'u1');
    expect(db.inserts).toHaveLength(0);
  });

  it('addComment передаёт author_id', async () => {
    await addComment('p1', 'Спасибо за маршрут!', 'u1');
    const call = db.inserts.find(c => c.table === 'community_comments');
    expect(call.payload.author_id).toBe('u1');
    expect(call.payload.post_id).toBe('p1');
    expect(call.payload.status).toBe('published');
  });
});

describe('supportApi — идемпотентность через client_msg_id', () => {
  it('createTicket кладёт p_client_msg_id и фото в формате { path }', async () => {
    await createTicket({
      subject: 'Проблема с картой',
      category: 'map_broken',
      body: 'Остановки не отображаются на карте города',
      photos: [{ path: 'u1/x.jpg' }],
      clientMsgId: 'cm-1',
    });
    expect(db.rpcs[0].name).toBe('support_create_ticket');
    expect(db.rpcs[0].args.p_client_msg_id).toBe('cm-1');
    expect(db.rpcs[0].args.p_photos).toEqual([{ path: 'u1/x.jpg' }]);
  });

  it('replyToTicket передаёт ticket, body и тот же client_msg_id при повторе', async () => {
    await replyToTicket('t1', 'Ответ поддержке', [{ path: 'u1/y.jpg' }], 'cm-2');
    await replyToTicket('t1', 'Ответ поддержке', [{ path: 'u1/y.jpg' }], 'cm-2');
    expect(db.rpcs).toHaveLength(2);
    for (const { name, args } of db.rpcs) {
      expect(name).toBe('support_reply');
      expect(args.p_ticket).toBe('t1');
      expect(args.p_body).toBe('Ответ поддержке');
      expect(args.p_client_msg_id).toBe('cm-2');
      expect(args.p_photos).toEqual([{ path: 'u1/y.jpg' }]);
    }
  });

  it('newClientMsgId возвращает уникальные значения', () => {
    expect(newClientMsgId()).not.toBe(newClientMsgId());
  });
});

describe('supportApi — ошибки и вспомогательные запросы', () => {
  it('ошибка прав (42501) превращается в понятное сообщение, не PG-код', async () => {
    db.nextResult = { data: null, error: { code: '42501', message: 'permission denied for table' } };
    await expect(
      createPost({ authorId: 'u1', category: 'routes', title: 'Тест', body: 'Тест' })
    ).rejects.toThrow('Недостаточно прав для этого действия');
  });

  it('fetchUnreadDevMessages группирует непрочитанные по тикетам', async () => {
    db.nextResult = {
      data: [{ ticket_id: 't1' }, { ticket_id: 't1' }, { ticket_id: 't2' }],
      error: null,
    };
    await expect(fetchUnreadDevMessages()).resolves.toEqual({ t1: 2, t2: 1 });
  });

  it('fetchUnreadDevMessages при ошибке возвращает пустой объект (не роняет страницу)', async () => {
    db.nextResult = { data: null, error: { message: 'network down' } };
    await expect(fetchUnreadDevMessages()).resolves.toEqual({});
  });
});
