echo "🚀 팀 앱 배포 시작..."

# 환경 확인
if [ ! -f ".env" ]; then
    echo "❌ .env 파일이 없습니다. .env.example을 복사해서 설정하세요."
    exit 1
fi

# Docker Compose로 배포
echo "📦 Docker 컨테이너 빌드 및 실행..."
docker-compose down
docker-compose build
docker-compose up -d

# 데이터베이스 마이그레이션 대기 및 실행
echo "⏳ 데이터베이스 준비 중..."
sleep 10

echo "🗃️ 데이터베이스 마이그레이션 실행..."
docker-compose exec backend npm run db:migrate

# 시드 데이터 생성 (선택사항)
echo "🌱 초기 데이터 생성..."
docker-compose exec backend npm run db:seed

# 헬스체크
echo "🏥 서비스 상태 확인..."
sleep 5

# 백엔드 헬스체크
if curl -f http://localhost:4000/health > /dev/null 2>&1; then
    echo "✅ 백엔드 서버 정상"
else
    echo "❌ 백엔드 서버 오류"
    docker-compose logs backend
    exit 1
fi

# 프론트엔드 확인
if curl -f http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ 프론트엔드 서버 정상"
else
    echo "❌ 프론트엔드 서버 오류"
    docker-compose logs frontend
    exit 1
fi

echo "🎉 배포 완료!"
echo "📱 프론트엔드: http://localhost:5173"
echo "🔧 백엔드 API: http://localhost:4000"
echo "📊 로그 확인: docker-compose logs -f"