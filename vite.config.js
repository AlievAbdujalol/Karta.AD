import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

/**
 * Ловушка, из-за которой прод-сборка тихо становилась dev:
 * NODE_ENV=development в .env.local или в переменных окружения Vercel
 * перебивает defaultNodeEnv у Vite → isProduction=false → в бандл попадает
 * React development («Download the React DevTools…», бандл больше),
 * import.meta.env.PROD=false, и клиент уходил напрямую в зеркала Overpass
 * вместо /api/overpass (CORS-ошибки в консоли karta-ad.vercel.app).
 * Фикс в две линии ниже гасит NODE_ENV до чтения .env*, а плагин-сторож
 * делает такую сборку ошибкой, а не молчаливым dev-режимом.
 */
function assertProductionBuild(command) {
  return {
    name: 'karta-assert-production-build',
    configResolved(config) {
      if (command !== 'build' || process.env.VITEST) return;
      if (!config.isProduction) {
        throw new Error(
          '[Karta-AD] Сборка не production: config.isProduction=false — ' +
            'NODE_ENV переопределён (.env* или окружение) на development. ' +
            'Убери NODE_ENV из .env.local / переменных Vercel; ' +
            'vite build всегда должен собирать прод.'
        );
      }
    },
  }
}

export default defineConfig(({ command }) => {
  // `vite build` всегда собирает прод, независимо от NODE_ENV в окружении.
  // Выполняется при загрузке конфига — до чтения .env* и вычисления
  // isProduction/define process.env.NODE_ENV, поэтому React и import.meta.env
  // в бандле гарантированно продовые. В dev (command !== 'build') не трогаем.
  if (command === 'build' && !process.env.VITEST) {
    process.env.NODE_ENV = 'production'
  }

  return {
    plugins: [
      react(),
      assertProductionBuild(command),
    ],
    server: {
      port: 5173,
      allowedHosts: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // Нормализуем сепараторы путей (Windows: '\') — сравнение как на POSIX
            const norm = id.replace(/\\/g, '/');
            if (norm.includes('leaflet') || norm.includes('react-leaflet')) return 'vendor-map';
            // clsx нужен и оболочке (toast), и recharts — без явного закрепления rollup
            // кладёт его в vendor-charts, и тогда форма входа прелоадит 399 КБ графиков
            if (norm.includes('/clsx/')) return 'index';
            if (norm.includes('recharts')) return 'vendor-charts';
            // Вендоры общего чанка — отдельными стабильными чанками:
            // 1) index (оболочка: вход/роутинг) становится заметно меньше —
            //    форма входа рисуется быстрее на слабой сети;
            // 2) fingerprinted-чанки React/Supabase не меняются между деплоями —
            //    повторные визиты берут их из кэша браузера.
            if (norm.includes('@supabase')) return 'vendor-supabase';
            if (norm.includes('react-router')) return 'vendor-router';
            if (norm.includes('/react-dom/') || norm.includes('/react/') || norm.includes('/scheduler/')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
  }
})