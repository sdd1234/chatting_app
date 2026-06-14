import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// 폰 설치용 APK 를 올바른 MIME(application/vnd.android.package-archive)으로 내려준다.
// vite 의 정적 서빙은 .apk 확장자에 MIME 을 안 붙여 브라우저가 .zip 으로 받는 문제 해결.
//   GET http://<PC LAN IP>:5173/app.apk → kakao-clone.apk 다운로드
function serveApk() {
  return {
    name: 'serve-apk',
    configureServer(server: any) {
      server.middlewares.use('/app.apk', (_req: any, res: any, next: any) => {
        const p = path.resolve(process.cwd(), 'public/app.apk');
        try {
          const stat = fs.statSync(p);
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', 'attachment; filename="kakao-clone.apk"');
          res.setHeader('Content-Length', String(stat.size));
          fs.createReadStream(p).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveApk()],
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
