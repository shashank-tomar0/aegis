import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('zustand')) return 'vendor-state';
            if (id.includes('@duckdb') || id.includes('@apache-arrow')) return 'vendor-db';
            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-ui';
            if (id.includes('@tanstack')) return 'vendor-query';
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    host: true,
  },
  optimizeDeps: {
    include: ['@duckdb/duckdb-wasm', '@apache-arrow/ts'],
  },
  worker: {
    format: 'es',
  },
})