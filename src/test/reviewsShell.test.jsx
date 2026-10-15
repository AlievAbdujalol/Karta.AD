import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const supportApi = vi.hoisted(() => ({
  isSupportDeveloper: vi.fn(async () => false),
  fetchFeed: vi.fn(async () => []),
  fetchReactions: vi.fn(async () => ({ counts: {}, mine: {} })),
  fetchMyTickets: vi.fn(async () => []),
  fetchUnreadDevMessages: vi.fn(async () => ({})),
  fetchTicketMessages: vi.fn(async () => []),
  fetchTicketPhotos: vi.fn(async () => []),
  fetchAllTickets: vi.fn(async () => []),
  fetchNotes: vi.fn(async () => []),
  addNote: vi.fn(async () => ({})),
  setTicketStatus: vi.fn(async (_id, status) => ({ id: 't1', status })),
  setTicketAssignee: vi.fn(async () => ({})),
  fetchComments: vi.fn(async () => []),
  addComment: vi.fn(async () => ({})),
  setReaction: vi.fn(async () => {}),
  reportTarget: vi.fn(async () => ({ already: false })),
  createPost: vi.fn(async () => ({ id: 'p1' })),
  createPostPhotos: vi.fn(async () => []),
  deletePost: vi.fn(async () => {}),
  createTicket: vi.fn(async () => ({ id: 't1', ticket_number: 1, status: 'new', duplicate: false })),
  replyToTicket: vi.fn(async () => ({ message_id: 'm1', duplicate: false })),
  markTicketRead: vi.fn(async () => 0),
  newClientMsgId: vi.fn(() => `cm-${Math.random().toString(16).slice(2)}`),
  subscribe: vi.fn(() => null),
  unsubscribe: vi.fn(),
}));
const insertReview = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/supportApi', () => supportApi);
vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: k => k, lang: 'ru', setLang: () => {} }),
}));
vi.mock('@/lib/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u1' } }),
}));
vi.mock('@/api/entities', () => ({
  Route: { list: vi.fn(async () => [{ id: 'r1', number: 42, name: 'Центр' }]) },
  Vehicle: { list: vi.fn(async () => []) },
  Review: { list: vi.fn(async () => []) },
}));
vi.mock('@/api/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertReview })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x/pub' } })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://x/sig' }, error: null })),
        remove: vi.fn(async () => ({ error: null })),
      })),
    },
    channel: vi.fn(() => ({ on: vi.fn(() => ({})), subscribe: vi.fn(() => ({})) })),
    removeChannel: vi.fn(),
  },
}));

import { MemoryRouter } from 'react-router-dom';
import Reviews from '../pages/Reviews';
import SupportDeveloper from '../pages/SupportDeveloper';

beforeEach(() => {
  vi.clearAllMocks();
  supportApi.isSupportDeveloper.mockResolvedValue(false);
});

afterEach(cleanup);

describe('Reviews — оболочка с четырьмя направлениями', () => {
  it('по умолчанию открывается «Сообщество», вкладка разработчика скрыта', async () => {
    render(<Reviews />);
    expect(await screen.findByText('support.newPost')).toBeTruthy();
    expect(screen.getByText('support.communitySubtitle')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /reviews\.tabDeveloper/ })).toBeNull();
    expect(supportApi.isSupportDeveloper).toHaveBeenCalledWith('u1');
    expect(supportApi.fetchFeed).toHaveBeenCalled();
  });

  it('вкладка «Разработчики» появляется только для support_developers', async () => {
    supportApi.isSupportDeveloper.mockResolvedValue(true);
    render(<Reviews />);
    const devTab = await screen.findByRole('tab', { name: /reviews\.tabDeveloper/ });
    fireEvent.click(devTab);
    expect(await screen.findByText('support.devTitle')).toBeTruthy();
    expect(supportApi.fetchAllTickets).toHaveBeenCalled();
  });

  it('переключение на «Обращения» показывает список и форму создания', async () => {
    render(<Reviews />);
    fireEvent.click(await screen.findByRole('tab', { name: /reviews\.tabSupport/ }));
    expect(await screen.findByText('support.noTickets')).toBeTruthy();
    fireEvent.click(screen.getByText('support.newTicket'));
    expect(screen.getByPlaceholderText('support.subjectPlaceholder')).toBeTruthy();
    expect(screen.getByPlaceholderText('support.bodyPlaceholder')).toBeTruthy();
    expect(supportApi.fetchMyTickets).toHaveBeenCalled();
  });

  it('валидация формы обращения: короткая тема не отправляется', async () => {
    render(<Reviews />);
    fireEvent.click(await screen.findByRole('tab', { name: /reviews\.tabSupport/ }));
    fireEvent.click(await screen.findByText('support.newTicket'));
    fireEvent.change(screen.getByPlaceholderText('support.subjectPlaceholder'), {
      target: { value: 'ab' },
    });
    fireEvent.change(screen.getByPlaceholderText('support.bodyPlaceholder'), {
      target: { value: 'Достаточно длинное описание проблемы' },
    });
    fireEvent.click(screen.getByRole('button', { name: /support\.sendTicket/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('support.subjectInvalid'));
    expect(supportApi.createTicket).not.toHaveBeenCalled();
  });

  it('повтор после сбоя использует ТОТ ЖЕ client_msg_id (нет дублей)', async () => {
    render(<Reviews />);
    fireEvent.click(await screen.findByRole('tab', { name: /reviews\.tabSupport/ }));
    fireEvent.click(await screen.findByText('support.newTicket'));
    fireEvent.change(screen.getByPlaceholderText('support.subjectPlaceholder'), {
      target: { value: 'Проблема с картой города' },
    });
    fireEvent.change(screen.getByPlaceholderText('support.bodyPlaceholder'), {
      target: { value: 'Остановки не отображаются при открытии карты' },
    });

    supportApi.createTicket.mockRejectedValueOnce(new Error('network down'));
    fireEvent.click(screen.getByRole('button', { name: /support\.sendTicket/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network down'));
    expect(supportApi.createTicket).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /support\.sendTicket/ }));
    await waitFor(() => expect(supportApi.createTicket).toHaveBeenCalledTimes(2));

    const first = supportApi.createTicket.mock.calls[0][0];
    const second = supportApi.createTicket.mock.calls[1][0];
    expect(first.clientMsgId).toBeTruthy();
    expect(second.clientMsgId).toBe(first.clientMsgId);
    expect(second.subject).toBe('Проблема с картой города');
    expect(second.photos).toEqual([]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('support.created'));
  });

  it('форма оценки поездки сохранена и отправляет отзыв (прежнее поведение)', async () => {
    render(<Reviews />);
    fireEvent.click(await screen.findByRole('tab', { name: /reviews\.tabTrip/ }));

    // без маршрута — ошибка, как раньше
    fireEvent.click(screen.getByRole('button', { name: /reviews\.submitButton/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('reviews.selectRouteError'));

    // выбираем маршрут и оценку
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: 'reviews.cleanlinessLabel: 5' }));
    fireEvent.click(screen.getByRole('button', { name: /reviews\.submitButton/ }));

    await waitFor(() => expect(insertReview).toHaveBeenCalledTimes(1));
    expect(insertReview.mock.calls[0][0]).toMatchObject({ route_id: 'r1', route_number: 42 });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('reviews.submitSuccess'));
  });
});

describe('/support/developer — отдельная точка входа', () => {
  const wrap = ui => <MemoryRouter>{ui}</MemoryRouter>;

  it('без роли разработчика показывает отказ, а не панель', async () => {
    render(wrap(<SupportDeveloper />));
    expect(await screen.findByText('support.noAccess')).toBeTruthy();
    expect(screen.queryByText('support.devTitle')).toBeNull();
    expect(supportApi.fetchAllTickets).not.toHaveBeenCalled();
  });

  it('для разработчика открывает панель', async () => {
    supportApi.isSupportDeveloper.mockResolvedValue(true);
    render(wrap(<SupportDeveloper />));
    expect(await screen.findByText('support.devTitle')).toBeTruthy();
    expect(supportApi.fetchAllTickets).toHaveBeenCalled();
  });
});
