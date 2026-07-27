import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/') || id.includes('react-router') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase') || id.includes('pg')) {
              return 'vendor-supabase';
            }
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'vendor-map';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-query';
            }
            if (id.includes('@stripe')) {
              return 'vendor-stripe';
            }
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-framer';
            }
            if (id.includes('three')) {
              return 'vendor-three';
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('date-fns') || id.includes('lodash') || id.includes('moment')) {
              return 'vendor-utils';
            }
            return 'vendor-other';
          }
        },
      },
    },
  },
})