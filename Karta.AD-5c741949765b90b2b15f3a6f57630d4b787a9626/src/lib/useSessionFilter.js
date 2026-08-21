import { useState } from 'react';

/**
 * Хук для хранения значения в sessionStorage с React-состоянием.
 *
 * @template T
 * @param {string} key - ключ в sessionStorage
 * @param {T} initial - начальное значение (используется при отсутствии или ошибке чтения)
 * @returns {[T, (newVal: T) => void]} - [текущее значение, функция обновления]
 */
export function useSessionFilter(key, initial) {
  const [value, setValueState] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch {
      // JSON.parse ошибка или sessionStorage недоступен
    }
    return initial;
  });

  const setValue = (newVal) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(newVal));
    } catch {
      // sessionStorage может быть недоступен (приватный режим, квота)
    }
    setValueState(newVal);
  };

  return [value, setValue];
}
