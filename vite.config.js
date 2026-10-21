import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
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
})