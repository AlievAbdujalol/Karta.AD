import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    exclude: ['node_modules', 'dist', '.kilo/**', '.kiro/**', '.agents/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Честный отчёт: считаем код приложения, а не артефакты и внешний kit.
      include: ['src/**', 'supabase/functions/**'],
      exclude: [
        'src/test/**', // тесты и их хелперы — не продукт
        'src/types/**', // TS-типы, в js-тестах не исполняются
        'src/components/ui/**', // shadcn/ui-заготовки (внешний kit, 0% по построению)
        'src/hooks/use-mobile.jsx', // штатный shadcn-хук для ui/sidebar
        'src/main.jsx', // entry-файлы
        'src/App.jsx',
        'src/api/base44Client.js', // мёртвый код: нигде не импортируется
        '**/*.d.ts',
      ],
      // Пороги зафиксированы ниже факта на 06.11.2026 (28.85/76.32/61.12/28.85).
      // Цель — расти, а не падать: пересматривать только вверх.
      thresholds: {
        statements: 28,
        branches: 74,
        functions: 58,
        lines: 28,
        // Logic-ядро держим заметно выше общего — там тесты уже есть.
        'src/lib/**': {
          statements: 60,
          branches: 75,
          functions: 60,
          lines: 60,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
