import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-leaflet', () => ({
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
}));

import NearbyDriversPopup from '@/components/taxi/NearbyDriversPopup';

const drivers = [
  { driver_id: 'd1', lat: 38.5, lng: 68.7 },
  { driver_id: 'd2', lat: 38.6, lng: 68.8 },
];

describe('NearbyDriversPopup: отправка заказа свободному водителю', () => {
  it('в активном поиске у каждого водителя есть кнопка отправки', () => {
    render(<NearbyDriversPopup drivers={drivers} canOffer onOffer={() => {}} />);
    expect(screen.getAllByRole('button', { name: 'Отправить заказ' })).toHaveLength(2);
    expect(screen.getAllByText('Свободный водитель')).toHaveLength(2);
  });

  it('клик отправляет предложение конкретному водителю', () => {
    const onOffer = vi.fn();
    render(<NearbyDriversPopup drivers={drivers} canOffer onOffer={onOffer} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onOffer).toHaveBeenCalledTimes(1);
    expect(onOffer).toHaveBeenCalledWith('d1');
  });

  it('после отправки попап показывает статус вместо кнопки', () => {
    const onOffer = vi.fn();
    render(<NearbyDriversPopup drivers={drivers} canOffer offeredDriverId="d1" onOffer={onOffer} />);

    expect(screen.getByText('✓ Предложение отправлено')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Отправить заказ' })).toHaveLength(1);

    fireEvent.click(screen.getByText('✓ Предложение отправлено'));
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('вне активного поиска кнопки нет — только текст', () => {
    render(<NearbyDriversPopup drivers={drivers} canOffer={false} onOffer={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByText('Свободный водитель')).toHaveLength(2);
  });
});
