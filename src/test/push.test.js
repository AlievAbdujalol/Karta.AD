/**
 * src/lib/push.js — Web Push подписка/отписка.
 * Публичный VAPID-ключ приходит с сервера; приватный ключ сюда не попадает.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { urlBase64ToUint8Array, isPushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push';

const { upsertMock, deleteEqMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  deleteEqMock: vi.fn(),
}));

vi.mock('@/api/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'push_subscriptions') {
        return { upsert: upsertMock, delete: () => ({ eq: deleteEqMock }) };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  },
}));

const USER = { id: 'user-1' };

function stubPushEnv({ permission = 'granted', registration } = {}) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      // registration === undefined → SW не зарегистрирован (dev): getRegistration
      // возвращает undefined, а сам метод всегда существует в браузере.
      getRegistration: vi.fn(async () => registration),
    },
    configurable: true,
  });
  window.PushManager = class {};
  window.Notification = { requestPermission: vi.fn(async () => permission) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete navigator.serviceWorker;
  delete window.PushManager;
  delete window.Notification;
});

describe('urlBase64ToUint8Array', () => {
  it('декодирует base64 без паддинга', () => {
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1]);
  });

  it('декодирует base64 стандартной длины', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });

  it('понимает base64url (- → +, _ → /) и добавляет паддинг', () => {
    expect(Array.from(urlBase64ToUint8Array('_w'))).toEqual([255]);
  });
});

describe('isPushSupported', () => {
  it('false без serviceWorker в navigator', () => {
    delete navigator.serviceWorker;
    window.PushManager = class {};
    window.Notification = {};
    expect(isPushSupported()).toBe(false);
  });

  it('true при serviceWorker + PushManager + Notification', () => {
    stubPushEnv();
    expect(isPushSupported()).toBe(true);
  });
});

describe('subscribeToPush', () => {
  beforeEach(() => {
    upsertMock.mockResolvedValue({ error: null });
    deleteEqMock.mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ publicKey: 'AQID' }) })));
  });

  it('null без пользователя', async () => {
    stubPushEnv();
    expect(await subscribeToPush(null)).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('null, если разрешение не получено', async () => {
    stubPushEnv({ permission: 'denied' });
    expect(await subscribeToPush(USER)).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('null, если SW не зарегистрирован (dev)', async () => {
    stubPushEnv({ registration: undefined });
    expect(await subscribeToPush(USER)).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('подписывается и сохраняет подписку в БД', async () => {
    const fakeSub = {
      toJSON: () => ({ endpoint: 'https://push.test/ep', keys: { p256dh: 'p', auth: 'a' } }),
    };
    const subscribe = vi.fn(async () => fakeSub);
    stubPushEnv({ registration: { pushManager: { subscribe } } });

    const result = await subscribeToPush(USER);

    expect(result).toBe(fakeSub);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', endpoint: 'https://push.test/ep', p256dh: 'p', auth: 'a' }),
      { onConflict: 'endpoint' },
    );
  });

  it('пробрасывает ошибку сохранения подписки', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'rls denied' } });
    const subscribe = vi.fn(async () => ({ toJSON: () => ({ endpoint: 'ep', keys: { p256dh: 'p', auth: 'a' } }) }));
    stubPushEnv({ registration: { pushManager: { subscribe } } });

    await expect(subscribeToPush(USER)).rejects.toThrow(/subscription save failed/);
  });
});

describe('unsubscribeFromPush', () => {
  it('ничего не делает, если подписки нет', async () => {
    stubPushEnv({ registration: { pushManager: { getSubscription: vi.fn(async () => null) } } });
    await unsubscribeFromPush(USER);
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it('отписывается и удаляет запись из БД', async () => {
    const unsubscribe = vi.fn(async () => true);
    const sub = { endpoint: 'https://push.test/ep', unsubscribe };
    stubPushEnv({ registration: { pushManager: { getSubscription: vi.fn(async () => sub) } } });

    await unsubscribeFromPush(USER);

    expect(unsubscribe).toHaveBeenCalled();
    expect(deleteEqMock).toHaveBeenCalledWith('endpoint', 'https://push.test/ep');
  });
});
