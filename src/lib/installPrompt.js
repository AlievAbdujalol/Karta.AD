/**
 * installPrompt.js — установка PWA по кнопке.
 *
 * Браузер стреляет `beforeinstallprompt` один раз, рано после загрузки страницы.
 * Если слушать его только в момент открытия профиля, событие уже прошло — и
 * кнопка показывает инструкцию вместо установки. Поэтому перехват ставится
 * один раз при старте приложения (см. main.jsx), а кнопка просто использует
 * накопленное событие.
 *
 * На iOS Safari события нет вовсе — там установка только через меню «Поделиться»,
 * для этого isIOS() и инструкция в компоненте.
 */

const PROMPT_KEY = '__kartaInstallPrompt';
const READY_EVENT = 'karta_install_ready';

let subscribed = false;

export function initInstallPrompt() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // свой промпт вместо системного
    window[PROMPT_KEY] = e;
    window.dispatchEvent(new CustomEvent(READY_EVENT));
  });

  window.addEventListener('appinstalled', () => {
    window[PROMPT_KEY] = null;
    window.dispatchEvent(new CustomEvent(READY_EVENT));
  });
}

export function getInstallPrompt() {
  if (typeof window === 'undefined') return null;
  return window[PROMPT_KEY] || null;
}

export function canAutoInstall() {
  return getInstallPrompt() !== null;
}

export function onInstallPromptChange(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(READY_EVENT, handler);
  return () => window.removeEventListener(READY_EVENT, handler);
}

export function isStandalone() {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true; // iOS
  } catch { /* нет matchMedia — считаем браузером */ }
  return false;
}

export function isIOS() {
  try {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

/**
 * Показывает системный диалог установки.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptInstall() {
  const deferred = getInstallPrompt();
  if (!deferred) return 'unavailable';
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // браузер даёт промпт один раз за сессию — чистим в любом случае
    window[PROMPT_KEY] = null;
    window.dispatchEvent(new CustomEvent(READY_EVENT));
    return outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    window[PROMPT_KEY] = null;
    return 'unavailable';
  }
}
