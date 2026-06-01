import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth':           { target: 'http://localhost:8081', changeOrigin: true },
      '/admin':          { target: 'http://localhost:8081', changeOrigin: true },
      '/ws/notice':      { target: 'ws://localhost:8081', ws: true, changeOrigin: true },
      '/ws':             { target: 'ws://localhost:8090', ws: true, changeOrigin: true },
      '/redis-state':    { target: 'http://localhost:8090', changeOrigin: true },
    },
  },
});
