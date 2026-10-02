import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import fc from 'fast-check';
import ErrorBoundary from '../components/ErrorBoundary';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'ru',
    fallbackLng: 'ru',
    resources: {
      ru: {
        translation: {
          'errorBoundary.defaultTitle': 'Что-то пошло не так',
          'errorBoundary.defaultMessage': 'Попробуйте обновить страницу',
          'errorBoundary.reloadButton': 'Перезагрузить страницу',
        },
      },
    },
    interpolation: { escapeValue: false },
  });
}

function ThrowingChild({ msg }) {
  throw new Error(msg);
}

describe('ErrorBoundary - Property Based Testing', () => {
  it('Property 17: ErrorBoundary catches errors and renders fallback UI', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length >= 5 && !s.includes('<') && !s.includes('>')),
        (errorMsg) => {
          document.body.innerHTML = '';
          const { unmount } = render(
            <I18nextProvider i18n={i18n}>
              <ErrorBoundary key={errorMsg}>
                <ThrowingChild msg={errorMsg} />
              </ErrorBoundary>
            </I18nextProvider>
          );

          expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
          expect(screen.getByText((content, node) => node.textContent === errorMsg)).toBeInTheDocument();
          expect(screen.getByRole('button', { name: 'Перезагрузить страницу' })).toBeInTheDocument();

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );

    consoleSpy.mockRestore();
  });
});
