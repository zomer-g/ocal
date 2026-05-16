import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Match /api/<anything> but NOT bare /api so the frontend can own the /api docs route.
      '^/api/.+': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
