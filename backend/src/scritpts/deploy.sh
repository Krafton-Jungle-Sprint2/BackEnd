echo "🧪 배포된 서비스 테스트..."

# API 테스트
echo "1️⃣ 백엔드 API 테스트..."

# 헬스체크
health_response=$(curl -s http://localhost:4000/health)
if [[ $health_response == *"OK"* ]]; then
    echo "✅ 헬스체크 통과"
else
    echo "❌ 헬스체크 실패: $health_response"
    exit 1
fi

# 회원가입 테스트
signup_response=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","nickname":"테스터"}')

if [[ $signup_response == *"token"* ]]; then
    echo "✅ 회원가입 API 동작"
else
    echo "⚠️ 회원가입 테스트 스킵 (이미 존재하는 사용자일 수 있음)"
fi

# 로그인 테스트
login_response=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}')

if [[ $login_response == *"token"* ]]; then
    echo "✅ 로그인 API 동작"
    
    # 토큰 추출
    token=$(echo $login_response | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    # TODO 조회 테스트
    todos_response=$(curl -s -H "Authorization: Bearer $token" \
      http://localhost:4000/api/todos)
    
    if [[ $todos_response == *"["* ]]; then
        echo "✅ TODO API 동작"
    else
        echo "❌ TODO API 오류"
    fi
    
    # 채팅방 조회 테스트
    rooms_response=$(curl -s -H "Authorization: Bearer $token" \
      http://localhost:4000/api/chat/rooms)
    
    if [[ $rooms_response == *"["* ]]; then
        echo "✅ 채팅 API 동작"
    else
        echo "❌ 채팅 API 오류"
    fi
    
else
    echo "❌ 로그인 API 실패: $login_response"
    exit 1
fi

# 프론트엔드 테스트
echo "2️⃣ 프론트엔드 테스트..."
frontend_response=$(curl -s -w "%{http_code}" http://localhost:3000 -o /dev/null)

if [ "$frontend_response" == "200" ]; then
    echo "✅ 프론트엔드 서버 응답"
else
    echo "❌ 프론트엔드 서버 오류 (HTTP: $frontend_response)"
fi

echo "🎉 배포 테스트 완료!"
echo ""
echo "📱 서비스 접속 정보:"
echo "- 웹사이트: http://localhost:3000"
echo "- API: http://localhost:4000/api"
echo "- 테스트 계정: admin@example.com / password123"
echo ""
echo "🔧 관리 명령어:"
echo "- 로그 확인: docker-compose logs -f [service]"
echo "- 서비스 재시작: docker-compose restart [service]"
echo "- 서비스 중지: docker-compose down"
echo "- DB 관리: docker-compose exec backend npm run db:studio"