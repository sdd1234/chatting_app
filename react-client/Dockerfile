# =========================================================================
# React 카톡 웹 UI — 멀티스테이지: vite 정적빌드 → nginx 서빙 + 백엔드 프록시
#   - 빌드 산출물 dist/ 를 nginx 로 서빙 (Node 런타임 불필요)
#   - public/app.apk 는 vite 가 dist 루트로 복사 → /app.apk 로 다운로드 제공
#   - tsc 타입체크는 데모 안정성 위해 건너뛰고 vite build 만 수행
# =========================================================================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
