import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import ErrorBoundary from '../components/ErrorBoundary';

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
            <ErrorBoundary key={errorMsg}>
              <ThrowingChild msg={errorMsg} />
            </ErrorBoundary>
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
