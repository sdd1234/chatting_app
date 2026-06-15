# Plain WebSocket 채팅 서버 (Node + ws). MongooseIM 안 거치는 경량 라우터.
FROM node:20-alpine
WORKDIR /app

# 의존성 캐시: package*.json 먼저 복사 후 설치
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 소스 + 정적 파일(test.html / index.html) 복사
COPY . .

EXPOSE 8090
CMD ["node", "server.js"]
