import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./lib/i18n";
import { initInstallPrompt } from "./lib/installPrompt";

// Ловим beforeinstallprompt сразу при старте: браузер стреляет событием один раз
// и рано, а кнопка «Скачать приложение» живёт в профиле и монтируется позже.
initInstallPrompt();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: service worker только в проде — в dev он мешает HMR и кеширует
// dev index.html (двойная регистрация и «SW registered» в консоли — были баги).
// MODE, а не PROD: PROD = (NODE_ENV === 'production'), а NODE_ENV можно
// переопределить (.env.local / переменные Vercel) — тогда в проде молча
// не регистрировался бы SW. MODE задаётся режимом сборки и не зависит от NODE_ENV.
if ('serviceWorker' in navigator && import.meta.env.MODE === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Dev: снимаем SW, зарегистрированные до этой правки, — иначе падавший
// офлайн-фолбэк продолжает отвечать network error'ом до авто-обновления.
if ('serviceWorker' in navigator && import.meta.env.MODE !== 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  });
}