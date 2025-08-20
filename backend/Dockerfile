# Dockerfile - 멀티스테이지 빌드
FROM node:20-slim as base

# 필수 패키지 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./
COPY prisma ./prisma/

# 개발 환경 스테이지
FROM base as development

# 개발 의존성 포함 설치
RUN npm ci --include=dev

# Prisma 클라이언트 생성
RUN npx prisma generate

# 사용자 권한 설정
RUN mkdir -p /home/node/.npm /home/node/.cache /home/node/.config \
    && chown -R node:node /home/node /app

USER node
ENV HOME=/home/node
ENV XDG_CONFIG_HOME=/home/node/.config
ENV XDG_CACHE_HOME=/home/node/.cache
ENV NPM_CONFIG_CACHE=/home/node/.npm

# 앱 소스 복사
COPY --chown=node:node . .

EXPOSE 4000 5000 5555 9229

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# 개발 서버 시작
CMD ["npm", "run", "dev"]

# 프로덕션 환경 스테이지
FROM base as production

# 프로덕션 의존성만 설치
RUN npm ci --only=production && npm cache clean --force

# Prisma 클라이언트 생성
RUN npx prisma generate

# 사용자 권한 설정
RUN mkdir -p /home/node/.npm /home/node/.cache /home/node/.config \
    && chown -R node:node /home/node /app

USER node
ENV HOME=/home/node
ENV NODE_ENV=production

# 앱 소스 복사 (필요한 파일만)
COPY --chown=node:node src ./src/
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node package*.json ./

EXPOSE 4000 5000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# 프로덕션 서버 시작
CMD ["npm", "start"]