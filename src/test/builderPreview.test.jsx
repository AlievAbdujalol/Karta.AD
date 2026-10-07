import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import BuilderPreview from '../components/aiBuilder/BuilderPreview';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseProps = (over = {}) => ({
  html: '<html><body>Превью</body></html>',
  versionKey: 'v1',
  previewMode: 'desktop',
  setPreviewMode: vi.fn(),
  isPublished: false,
  onPublish: vi.fn(),
  publicUrl: 'https://karta.ad/store/my-shop',
  copied: false,
  onCopyLink: vi.fn(),
  onExport: vi.fn(),
  onExportProject: vi.fn(),
  onRefreshData: vi.fn(),
  refreshingData: false,
  empty: <p>Пусто</p>,
  ...over,
});

describe('BuilderPreview', () => {
  it('переключение девайсов вызывает setPreviewMode', () => {
    const setPreviewMode = vi.fn();
    render(<BuilderPreview {...baseProps({ setPreviewMode })} />);
    fireEvent.click(screen.getByTitle('Mobile'));
    expect(setPreviewMode).toHaveBeenCalledWith('mobile');
    fireEvent.click(screen.getByTitle('Tablet'));
    expect(setPreviewMode).toHaveBeenCalledWith('tablet');
  });

  it('без html — пустое состояние, действий нет', () => {
    render(<BuilderPreview {...baseProps({ html: '' })} />);
    expect(screen.getByText('Пусто')).toBeTruthy();
    expect(screen.queryByTitle('Скачать HTML')).toBeNull();
    expect(screen.queryByTitle('Website preview')).toBeNull();
  });

  it('не опубликован — есть Publish, нет копирования и открытия', () => {
    render(<BuilderPreview {...baseProps({ isPublished: false })} />);
    expect(screen.getByText('Publish')).toBeTruthy();
    expect(screen.queryByTitle('Открыть сайт в новой вкладке')).toBeNull();
    expect(screen.queryByTitle('Скопировать ссылку')).toBeNull();
  });

  it('опубликован — «Опубликован», копирование и открытие в новой вкладке', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onCopyLink = vi.fn();
    render(<BuilderPreview {...baseProps({ isPublished: true, copied: true, onCopyLink })} />);

    expect(screen.getByText('Опубликован')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Открыть сайт в новой вкладке'));
    expect(open).toHaveBeenCalledWith('https://karta.ad/store/my-shop', '_blank', 'noopener,noreferrer');

    fireEvent.click(screen.getByTitle('Скопировать ссылку'));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('скелет загрузки виден до onLoad iframe и уходит после', () => {
    render(<BuilderPreview {...baseProps()} />);
    expect(screen.getByTestId('preview-loading')).toBeTruthy();
    fireEvent.load(screen.getByTitle('Website preview'));
    expect(screen.queryByTestId('preview-loading')).toBeNull();
  });

  it('без onExportProject кнопка «Проект» не показывается', () => {
    render(<BuilderPreview {...baseProps({ onExportProject: undefined })} />);
    expect(screen.queryByTitle(/React-проект/)).toBeNull();
    expect(screen.queryByTitle('Скачать HTML')).toBeTruthy();
  });

  it('с onExportProject кнопка ZIP-проекта на месте', () => {
    const onExportProject = vi.fn();
    render(<BuilderPreview {...baseProps({ onExportProject })} />);
    fireEvent.click(screen.getByTitle('Скачать полный React-проект магазина (ZIP)'));
    expect(onExportProject).toHaveBeenCalledTimes(1);
  });
});
