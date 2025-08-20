#!/bin/bash
echo "🛠️ 개발환경 설정 시작..."

# Node.js 버전 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되지 않았습니다."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 이상이 필요합니다. 현재: $(node -v)"
    exit 1
fi

# 백엔드 의존성 설치
echo "📦 백엔드 의존성 설치..."
cd backend
npm install
npx prisma generate

# 개발용 데이터베이스 실행
echo "🗃️ 개발용 MySQL 시작..."
cd ..
docker-compose -f docker-compose.dev.yml up -d db

# 마이그레이션
echo "🔄 데이터베이스 마이그레이션..."
sleep 10
cd backend
npm run db:migrate
npm run db:seed

echo "✅ 개발환경 준비 완료!"
echo "🚀 개발 서버 실행: npm run dev"
echo "📊 DB 관리: npm run db:studio"