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
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}