import { defineConfig, loadEnv } from 'vite'
import path from 'path'

/**
 * Отдельная сборка виджета для чужих сайтов: один IIFE-файл dist/widget.js
 * без SPA-бандла и без CSS-файлов (стили внутри Shadow DOM).
 * Запускается второй командой в `npm run build`, поэтому НЕ стирает dist
 * (emptyOutDir: false) после основной сборки.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      // publishable-ключи: вшиваются в публичный файл виджета намеренно
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'es2018',
      minify: 'esbuild',
      lib: {
        entry: path.resolve(__dirname, 'src/widget/entry.js'),
        formats: ['iife'],
        name: 'KartaWidget',
        fileName: () => 'widget.js',
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  }
})
