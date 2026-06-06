import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // WSL /mnt/c(9p)는 inotify 미동작 → polling 으로 파일변경 감지(HMR 정상화)
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/auth':           { target: 'http://localhost:8081', changeOrigin: true },
      '/admin':          { target: 'http://localhost:8081', changeOrigin: true },
      '/users':          { target: 'http://localhost:8081', changeOrigin: true },
      '/translate':      { target: 'http://localhost:8081', changeOrigin: true },
      '/files':          { target: 'http://localhost:8081', changeOrigin: true },
      '/ws/notice':      { target: 'ws://localhost:8081', ws: true, changeOrigin: true },
      '/ws':             { target: 'ws://localhost:8090', ws: true, changeOrigin: true },
      '/redis-state':    { target: 'http://localhost:8090', changeOrigin: true },
    },
  },
});
