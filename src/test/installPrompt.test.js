import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadModule() {
  // свежий модуль на каждый тест: состояние в window не должно течь между кейсами
  vi.resetModules();
  return import('../lib/installPrompt');
}

function fakePromptEvent() {
  return {
    prevented: false,
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    preventDefault() { this.prevented = true; },
  };
}

describe('initInstallPrompt', () => {
  beforeEach(() => {
    delete window.__kartaInstallPrompt;
  });

  it('перехватывает beforeinstallprompt при старте приложения', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();

    const event = Object.assign(new Event('beforeinstallprompt'), fakePromptEvent());
    event.preventDefault = function () { this.__prevented = true; };
    window.dispatchEvent(event);

    expect(event.__prevented).toBe(true); // браузерный промпт подавлен, будет наш
    expect(mod.getInstallPrompt()).not.toBeNull();
  });

  it('подписывается на событие только один раз', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    mod.initInstallPrompt();
    mod.initInstallPrompt();

    const e = fakePromptEvent();
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), e));
    expect(mod.getInstallPrompt()).not.toBeNull();
  });

  it('сбрасывает промпт после appinstalled', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakePromptEvent()));
    expect(mod.getInstallPrompt()).not.toBeNull();

    window.dispatchEvent(new Event('appinstalled'));
    expect(mod.getInstallPrompt()).toBeNull();
  });
});

describe('promptInstall', () => {
  beforeEach(() => {
    delete window.__kartaInstallPrompt;
  });

  it('accepted — пользователь принял установку, промпт сбрасывается', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    const e = fakePromptEvent();
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), e));

    const res = await mod.promptInstall();
    expect(res).toBe('accepted');
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(mod.getInstallPrompt()).toBeNull();
  });

  it('dismissed — отказ, но промпт тоже сбрасывается (браузер даёт один раз)', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    const e = fakePromptEvent();
    e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), e));

    expect(await mod.promptInstall()).toBe('dismissed');
    expect(mod.getInstallPrompt()).toBeNull();
  });

  it('unavailable — промпта нет (iOS, Firefox, уже отклонено)', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    expect(await mod.promptInstall()).toBe('unavailable');
  });

  it('ошибка промпта не ломает UI', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    const e = fakePromptEvent();
    e.prompt = vi.fn().mockRejectedValue(new Error('boom'));
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), e));

    expect(await mod.promptInstall()).toBe('unavailable');
  });
});

describe('isStandalone', () => {
  it('true в режиме standalone', async () => {
    const mod = await loadModule();
    const orig = window.matchMedia;
    window.matchMedia = () => ({ matches: true });
    expect(mod.isStandalone()).toBe(true);
    window.matchMedia = orig;
  });

  it('true для iOS-режима и false в обычном браузере', async () => {
    const mod = await loadModule();
    const orig = window.matchMedia;
    window.matchMedia = () => ({ matches: false });

    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    expect(mod.isStandalone()).toBe(true);

    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
    expect(mod.isStandalone()).toBe(false);
    window.matchMedia = orig;
  });
});

describe('canAutoInstall', () => {
  beforeEach(() => {
    delete window.__kartaInstallPrompt;
  });

  it('true только когда браузер дал промпт', async () => {
    const mod = await loadModule();
    mod.initInstallPrompt();
    expect(mod.canAutoInstall()).toBe(false);
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakePromptEvent()));
    expect(mod.canAutoInstall()).toBe(true);
  });
});
