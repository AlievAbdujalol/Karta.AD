import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/siteImages', () => ({ uploadSiteImage: vi.fn() }));
vi.mock('@/lib/openrouter', () => ({
  SITE_MODULES: [{ id: 'cart', label: 'Корзина', icon: '🛒' }],
}));

import SectionsPanel, { PANEL_MIN_H, PANEL_MAX_H, PANEL_DEFAULT_H } from '../components/aiBuilder/SectionsPanel';

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

const SECTIONS = [
  { type: 'hero', title: 'Первый', description: '' },
  { type: 'features', title: 'Второй', description: '' },
  { type: 'products', title: 'Третий', description: '' },
];

const baseProps = (over = {}) => ({
  sections: SECTIONS,
  userId: 'u1',
  onUpdateSection: vi.fn(),
  onDeleteSection: vi.fn(),
  onAddSection: vi.fn(),
  onMoveSection: vi.fn(),
  onAskAi: vi.fn(),
  busy: false,
  ...over,
});

describe('SectionsPanel: поднять/опустить секцию', () => {
  it('стрелки есть у каждой строки, у границ отключены', () => {
    render(<SectionsPanel {...baseProps()} />);
    const up = screen.getAllByTitle('Поднять блок');
    const down = screen.getAllByTitle('Опустить блок');
    expect(up).toHaveLength(3);
    expect(down).toHaveLength(3);
    expect(up[0].disabled).toBe(true);   // первый вверх не может
    expect(up[1].disabled).toBe(false);
    expect(down[0].disabled).toBe(false);
    expect(down[2].disabled).toBe(true); // последний вниз не может
  });

  it('клик отдаёт onMoveSection(индекс, направление)', () => {
    const onMoveSection = vi.fn();
    render(<SectionsPanel {...baseProps({ onMoveSection })} />);
    fireEvent.click(screen.getAllByTitle('Опустить блок')[1]);
    expect(onMoveSection).toHaveBeenCalledWith(1, 1);
    fireEvent.click(screen.getAllByTitle('Поднять блок')[2]);
    expect(onMoveSection).toHaveBeenCalledWith(2, -1);
  });

  it('при busy перемещение отключено (идёт генерация/сохранение)', () => {
    render(<SectionsPanel {...baseProps({ busy: true })} />);
    expect(screen.getAllByTitle('Поднять блок')[1].disabled).toBe(true);
    expect(screen.getAllByTitle('Опустить блок')[0].disabled).toBe(true);
  });

  it('раскрытая секция «переезжает» вместе со своей строкой', () => {
    const { rerender } = render(<SectionsPanel {...baseProps()} />);
    // раскрыть первую секцию
    fireEvent.click(screen.getByText('Первый'));
    expect(screen.getByDisplayValue('Первый')).toBeTruthy();

    // поднять/опустить — родитель пересчитал порядок секций
    fireEvent.click(screen.getAllByTitle('Опустить блок')[0]);
    rerender(<SectionsPanel {...baseProps({ sections: [SECTIONS[1], SECTIONS[0], SECTIONS[2]] })} />);

    // открытой остаётся та же секция «Первый», а не та, что теперь на месте i=0
    const openInputs = screen.getAllByPlaceholderText('Title');
    expect(openInputs).toHaveLength(1);
    expect(openInputs[0].value).toBe('Первый');
  });
});

describe('SectionsPanel: высота панели (перетаскивание границы)', () => {
  const HANDLE = 'Потянуть, чтобы изменить высоту панели';

  it('разделитель высоты есть на верхней границе панели', () => {
    render(<SectionsPanel {...baseProps()} />);
    expect(screen.getByTitle(HANDLE)).toBeTruthy();
  });

  it('тянем вверх — список выше; тянем вниз — ниже; лимиты MIN/MAX соблюдаются', () => {
    render(<SectionsPanel {...baseProps()} />);
    const handle = screen.getByTitle(HANDLE);
    const list = screen.getByTestId('sections-list');
    expect(list.style.maxHeight).toBe(`${PANEL_DEFAULT_H}px`);

    fireEvent.mouseDown(handle, { clientY: 300 });
    fireEvent.mouseMove(window, { clientY: 250 }); // вверх на 50
    expect(list.style.maxHeight).toBe(`${PANEL_DEFAULT_H + 50}px`);
    fireEvent.mouseMove(window, { clientY: -99999 }); // потолок
    expect(list.style.maxHeight).toBe(`${PANEL_MAX_H}px`);
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(handle, { clientY: 0 });
    fireEvent.mouseMove(window, { clientY: 99999 }); // пол до упора
    expect(list.style.maxHeight).toBe(`${PANEL_MIN_H}px`);
    fireEvent.mouseUp(window);
  });

  it('высота сохраняется в sessionStorage и переживает новый монтаж', () => {
    const { unmount } = render(<SectionsPanel {...baseProps()} />);
    const handle = screen.getByTitle(HANDLE);
    fireEvent.mouseDown(handle, { clientY: 300 });
    fireEvent.mouseMove(window, { clientY: 260 });
    fireEvent.mouseUp(window);
    expect(sessionStorage.getItem('karta-edit-section-height')).toBe(String(PANEL_DEFAULT_H + 40));

    unmount();
    render(<SectionsPanel {...baseProps()} />);
    expect(screen.getByTestId('sections-list').style.maxHeight).toBe(`${PANEL_DEFAULT_H + 40}px`);
  });
});
