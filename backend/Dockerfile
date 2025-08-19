FROM node:18-alpine

# 필요한 패키지 설치 (curl은 헬스체크용)
RUN apk add --no-cache curl

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 먼저 복사 (Docker 캐시 최적화)
COPY package*.json ./
COPY prisma ./prisma/

# 의존성 설치 (production + prisma)
RUN npm ci --only=production && \
    npm install prisma --save-dev

# Prisma 클라이언트 생성
RUN npx prisma generate

# 소스 코드 복사 (캐시 최적화를 위해 마지막에)
COPY src ./src

# 불필요한 파일 제거 (보안)
RUN rm -rf /app/node_modules/.cache

# 비root 사용자 생성 및 권한 설정 (보안 강화)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

# 포트 노출 (Prisma Studio용 5555 추가)
EXPOSE 4000 5000 5555

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# 앱 시작
CMD ["npm", "start"]