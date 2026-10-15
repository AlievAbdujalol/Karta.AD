import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const supportApi = vi.hoisted(() => ({
  fetchAllTickets: vi.fn(async () => [
    {
      id: 't1',
      ticket_number: 7,
      subject: 'Карта грузится медленно',
      category: 'map_broken',
      status: 'new',
      updated_at: '2026-10-15T10:00:00Z',
      created_at: '2026-10-15T09:00:00Z',
      user_id: 'u2',
      assigned_developer_id: null,
      client_msg_id: null,
      closed_at: null,
    },
  ]),
  fetchTicketMessages: vi.fn(async () => []),
  fetchTicketPhotos: vi.fn(async () => []),
  fetchNotes: vi.fn(async () => [{ id: 'n1', body: 'Внутренняя заметка', created_at: '2026-10-15T10:05:00Z', developer_id: 'u1' }]),
  addNote: vi.fn(async () => ({})),
  setTicketStatus: vi.fn(async (id, status) => ({ id, status })),
  setTicketAssignee: vi.fn(async () => ({})),
  replyToTicket: vi.fn(async () => ({ message_id: 'm9', duplicate: false })),
  markTicketRead: vi.fn(async () => 0),
  newClientMsgId: vi.fn(() => `cm-${Date.now()}-${Math.random().toString(16).slice(2)}`),
  removeStoragePhoto: vi.fn(async () => {}),
  fetchComments: vi.fn(async () => []),
  addComment: vi.fn(async () => ({})),
  setReaction: vi.fn(async () => {}),
  reportTarget: vi.fn(async () => ({ already: false })),
  createPost: vi.fn(async () => ({ id: 'p1' })),
  createPostPhotos: vi.fn(async () => []),
  deletePost: vi.fn(async () => {}),
  subscribe: vi.fn(() => null),
  unsubscribe: vi.fn(),
}));

// Управляемая задержка загрузки в Storage — для тестов гонок «удалил во время загрузки».
const storage = vi.hoisted(() => ({
  uploadImpl: null, // тест подменяет; null → мгновенный успех
  from: vi.fn(() => ({
    upload: vi.fn(async (...args) => {
      const impl = storage.uploadImpl;
      return impl ? impl(...args) : { error: null };
    }),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x/pub' } })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://x/sig' }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  })),
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/supportApi', () => supportApi);
vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: k => k, lang: 'ru', setLang: () => {} }),
}));
vi.mock('@/api/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
    })),
    storage,
    channel: vi.fn(() => ({ on: vi.fn(() => ({})), subscribe: vi.fn(() => ({})) })),
    removeChannel: vi.fn(),
  },
}));

import PhotoPicker from '../components/support/PhotoPicker';
import DeveloperTab from '../components/support/DeveloperTab';
import TicketThread from '../components/support/TicketThread';
import CommunityComposer from '../components/support/CommunityComposer';
import CommunityPostCard from '../components/support/CommunityPostCard';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

function pickFiles(input, files) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.uploadImpl = null;
  // jsdom не умеет object-URL
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:preview');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('PhotoPicker — валидация и загрузка', () => {
  it('валидный JPEG грузится в Storage и попадает в список готовых фото', async () => {
    let captured = null;
    const onChange = v => { captured = v; };
    const { container } = render(
      <PhotoPicker bucket="support-photos" userId="u1" value={[]} onChange={onChange} maxCount={4} />
    );
    pickFiles(screen.getByTestId('photo-input'), [
      new File([JPEG], 'shot.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(captured).toBeTruthy());
    await waitFor(() => expect(captured[0]?.status).toBe('ready'));
    expect(captured[0].path).toMatch(/^u1\//);
    expect(captured[0].mime).toBe('image/jpeg');
    expect(container.querySelector('img')).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('файл не-картинка отклоняется до загрузки', async () => {
    let captured = null;
    render(
      <PhotoPicker bucket="support-photos" userId="u1" value={[]} onChange={v => { captured = v; }} maxCount={4} />
    );
    pickFiles(screen.getByTestId('photo-input'), [
      new File([GIF], 'anim.gif', { type: 'image/gif' }),
    ]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('support.photoBadType'));
    expect(captured ?? []).toEqual([]);
    expect(document.querySelector('img')).toBeNull();
  });

  it('лимит фото соблюдается: пятый файл не добавляется', async () => {
    let captured = [];
    render(
      <PhotoPicker
        bucket="support-photos"
        userId="u1"
        value={[]}
        onChange={v => { captured = v; }}
        maxCount={1}
      />
    );
    const input = screen.getByTestId('photo-input');
    pickFiles(input, [new File([JPEG], 'a.jpg', { type: 'image/jpeg' })]);
    await waitFor(() => expect(captured[0]?.status).toBe('ready'));

    pickFiles(input, [new File([JPEG], 'b.jpg', { type: 'image/jpeg' })]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('support.photoCountLimit'));
    expect(captured).toHaveLength(1);
  });
});

describe('DeveloperTab — панель разработчика', () => {
  it('показывает список обращений и открывает переписку', async () => {
    render(<DeveloperTab userId="u1" />);
    expect(await screen.findByText(/#7 Карта грузится медленно/)).toBeTruthy();
    fireEvent.click(screen.getByText(/#7 Карта грузится медленно/));
    expect(await screen.findByTestId('thread-messages')).toBeTruthy();
    expect(supportApi.fetchNotes).toHaveBeenCalledWith('t1');
    // внутренняя заметка видна только в панели
    expect(await screen.findByText('Внутренняя заметка')).toBeTruthy();
  });

  it('смена статуса идёт через серверное обновление', async () => {
    render(<DeveloperTab userId="u1" />);
    fireEvent.click(await screen.findByText(/#7 Карта грузится медленно/));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'resolved' } });
    await waitFor(() =>
      expect(supportApi.setTicketStatus).toHaveBeenCalledWith('t1', 'resolved')
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('support.statusChanged'));
  });

  it('«Взять на себя» назначает ответственным текущего разработчика', async () => {
    render(<DeveloperTab userId="u1" />);
    fireEvent.click(await screen.findByText(/#7 Карта грузится медленно/));
    fireEvent.click(await screen.findByRole('button', { name: /support\.take/ }));
    await waitFor(() =>
      expect(supportApi.setTicketAssignee).toHaveBeenCalledWith('t1', 'u1')
    );
  });

  it('добавление внутренней заметки уходит в developer_notes от своего имени', async () => {
    render(<DeveloperTab userId="u1" />);
    fireEvent.click(await screen.findByText(/#7 Карта грузится медленно/));
    const input = await screen.findByPlaceholderText('support.notePlaceholder');
    fireEvent.change(input, { target: { value: 'Проверить логи карты' } });
    fireEvent.click(screen.getByRole('button', { name: 'support.noteAdd' }));
    await waitFor(() =>
      expect(supportApi.addNote).toHaveBeenCalledWith('t1', 'u1', 'Проверить логи карты')
    );
  });

  it('фильтр по статусу передаётся в выборку', async () => {
    render(<DeveloperTab userId="u1" />);
    await screen.findByText(/#7 Карта грузится медленно/);
    expect(supportApi.fetchAllTickets).toHaveBeenCalledWith('all');
    fireEvent.click(screen.getByRole('button', { name: 'support.status.closed' }));
    await waitFor(() => expect(supportApi.fetchAllTickets).toHaveBeenCalledWith('closed'));
  });
});

describe('PhotoPicker — гонки загрузки', () => {
  it('удаление файла во время загрузки удаляет его из bucket (нет сирот)', async () => {
    let resolveUpload;
    storage.uploadImpl = () => new Promise(res => { resolveUpload = res; });
    render(
      <PhotoPicker bucket="support-photos" userId="u1" value={[]} onChange={() => {}} maxCount={4} />
    );
    pickFiles(screen.getByTestId('photo-input'), [
      new File([JPEG], 'a.jpg', { type: 'image/jpeg' }),
    ]);
    // карточка загрузки появилась; ждём, пока upload реально начнётся
    const removeBtn = await screen.findByRole('button', { name: 'support.removePhoto' });
    await waitFor(() => expect(resolveUpload).toBeTruthy());
    expect(supportApi.removeStoragePhoto).not.toHaveBeenCalled();

    fireEvent.click(removeBtn); // убрали из списка, пока грузился
    resolveUpload({ error: null }); // загрузка завершилась позже

    await waitFor(() =>
      expect(supportApi.removeStoragePhoto).toHaveBeenCalledWith(
        'support-photos',
        expect.stringMatching(/^u1\//)
      )
    );
    expect(document.querySelector('img')).toBeNull(); // карточка не вернулась
  });
});

describe('TicketThread — отправка ответа', () => {
  const ticket = {
    id: 't1',
    ticket_number: 7,
    subject: 'Карта грузится медленно',
    category: 'map_broken',
    status: 'new',
  };

  it('повтор после сбоя использует ТОТ ЖЕ client_msg_id — дубля не будет', async () => {
    render(<TicketThread ticket={ticket} userId="u1" mode="user" onChanged={() => {}} />);
    const input = await screen.findByPlaceholderText('support.replyPlaceholder');
    fireEvent.change(input, { target: { value: 'Спасибо, перепроверю' } });

    supportApi.replyToTicket.mockRejectedValueOnce(new Error('network down'));
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network down'));
    expect(supportApi.replyToTicket).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Enter' }); // повтор
    await waitFor(() => expect(supportApi.replyToTicket).toHaveBeenCalledTimes(2));

    const [, body1, , cm1] = supportApi.replyToTicket.mock.calls[0];
    const [, body2, , cm2] = supportApi.replyToTicket.mock.calls[1];
    expect(body1).toBe('Спасибо, перепроверю');
    expect(body2).toBe('Спасибо, перепроверю');
    expect(cm1).toBeTruthy();
    expect(cm2).toBe(cm1);
  });

  it('повторные Enter во время отправки не плодят сообщения', async () => {
    let resolveSend;
    supportApi.replyToTicket.mockImplementationOnce(() => new Promise(res => { resolveSend = res; }));
    render(<TicketThread ticket={ticket} userId="u1" mode="user" onChanged={() => {}} />);
    const input = await screen.findByPlaceholderText('support.replyPlaceholder');
    fireEvent.change(input, { target: { value: 'Одно сообщение' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(supportApi.replyToTicket).toHaveBeenCalledTimes(1);

    resolveSend({ message_id: 'm1', duplicate: false });
    await waitFor(() => expect(toast.error).not.toHaveBeenCalled());
    expect(supportApi.replyToTicket).toHaveBeenCalledTimes(1);
  });
});

describe('CommunityPostCard — комментарии', () => {
  const post = {
    id: 'p1',
    author_id: 'u9',
    category: 'routes',
    title: 'Маршрут 42',
    body: 'Отличный маршрут',
    created_at: '2026-10-15T10:00:00Z',
    community_photos: [],
  };

  it('комментарий уходит с author_id текущего пользователя', async () => {
    render(<CommunityPostCard post={post} userId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: 'support.comments' }));
    const input = await screen.findByPlaceholderText('support.commentPlaceholder');
    fireEvent.change(input, { target: { value: 'Класс!' } });
    fireEvent.click(screen.getByRole('button', { name: 'support.sendComment' }));
    await waitFor(() =>
      expect(supportApi.addComment).toHaveBeenCalledWith('p1', 'Класс!', 'u1')
    );
  });

  it('двойной Enter отправляет один комментарий', async () => {
    let resolveSend;
    supportApi.addComment.mockImplementationOnce(() => new Promise(res => { resolveSend = res; }));
    render(<CommunityPostCard post={post} userId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: 'support.comments' }));
    const input = await screen.findByPlaceholderText('support.commentPlaceholder');
    fireEvent.change(input, { target: { value: 'Спасибо за отзыв!' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(supportApi.addComment).toHaveBeenCalledTimes(1);

    resolveSend({ id: 'c1' });
    await waitFor(() => expect(toast.error).not.toHaveBeenCalled());
    expect(supportApi.addComment).toHaveBeenCalledTimes(1);
  });
});

describe('CommunityComposer — публикация и отмена', () => {
  const fill = () => {
    fireEvent.change(screen.getByPlaceholderText('support.postTitlePlaceholder'), {
      target: { value: 'Маршрут 42' },
    });
    fireEvent.change(screen.getByPlaceholderText('support.postBodyPlaceholder'), {
      target: { value: 'Отличный маршрут, порекомендую всем' },
    });
  };

  const waitForPhotoReady = async () => {
    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /support\.publish/ })).toBeEnabled()
    );
  };

  it('публикация уходит с author_id, фото привязываются от владельца', async () => {
    const onCreated = vi.fn();
    const onCancel = vi.fn();
    render(<CommunityComposer userId="u1" onCreated={onCreated} onCancel={onCancel} />);
    fill();
    pickFiles(screen.getByTestId('photo-input'), [
      new File([JPEG], 'a.jpg', { type: 'image/jpeg' }),
    ]);
    await waitForPhotoReady();

    fireEvent.click(screen.getByRole('button', { name: /support\.publish/ }));
    await waitFor(() =>
      expect(supportApi.createPost).toHaveBeenCalledWith({
        authorId: 'u1',
        category: 'routes',
        title: 'Маршрут 42',
        body: 'Отличный маршрут, порекомендую всем',
      })
    );
    await waitFor(() =>
      expect(supportApi.createPostPhotos).toHaveBeenCalledWith(
        'p1',
        [expect.objectContaining({ path: expect.stringMatching(/^u1\//), mime: 'image/jpeg' })],
        'u1'
      )
    );
    expect(onCreated).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled(); // композер закрывается
    // успешная публикация НЕ удаляет привязанные фото
    expect(supportApi.removeStoragePhoto).not.toHaveBeenCalled();
  });

  it('отмена публикации удаляет уже загруженные фото из bucket', async () => {
    const onCancel = vi.fn();
    render(<CommunityComposer userId="u1" onCreated={() => {}} onCancel={onCancel} />);
    fill();
    pickFiles(screen.getByTestId('photo-input'), [
      new File([JPEG], 'a.jpg', { type: 'image/jpeg' }),
    ]);
    await waitForPhotoReady();

    fireEvent.click(screen.getByRole('button', { name: 'support.close' }));
    await waitFor(() =>
      expect(supportApi.removeStoragePhoto).toHaveBeenCalledWith(
        'community-photos',
        expect.stringMatching(/^u1\//)
      )
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it('сбой привязки фото удаляет пост — публикация не выглядит успешной', async () => {
    supportApi.createPostPhotos.mockRejectedValueOnce(new Error('photo link failed'));
    render(<CommunityComposer userId="u1" onCreated={() => {}} onCancel={() => {}} />);
    fill();
    pickFiles(screen.getByTestId('photo-input'), [
      new File([JPEG], 'a.jpg', { type: 'image/jpeg' }),
    ]);
    await waitForPhotoReady();

    fireEvent.click(screen.getByRole('button', { name: /support\.publish/ }));
    await waitFor(() => expect(supportApi.deletePost).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('photo link failed'));
  });
});
