#!/bin/bash

echo "🧪 배포된 서비스 테스트 시작..."
echo "================================================"

# 컬러 출력을 위한 함수
print_success() {
    echo -e "\033[32m✅ $1\033[0m"
}

print_error() {
    echo -e "\033[31m❌ $1\033[0m"
}

print_warning() {
    echo -e "\033[33m⚠️ $1\033[0m"
}

print_info() {
    echo -e "\033[34mℹ️ $1\033[0m"
}

# 서비스 상태 확인 함수
check_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    print_info "$service_name 서비스 대기 중..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            print_success "$service_name 서비스 응답 확인"
            return 0
        fi
        
        echo "   시도 $attempt/$max_attempts ..."
        sleep 2
        ((attempt++))
    done
    
    print_error "$service_name 서비스 응답 없음 (60초 대기 후)"
    return 1
}

# Docker 컨테이너 상태 확인
echo "🐳 Docker 컨테이너 상태 확인..."
if ! docker-compose ps | grep -q "Up"; then
    print_error "Docker 컨테이너가 실행되지 않았습니다"
    echo "다음 명령어로 서비스를 시작하세요:"
    echo "  docker-compose up -d"
    exit 1
fi

# 백엔드 서비스 대기
if ! check_service "http://localhost:4000/health" "백엔드 API"; then
    exit 1
fi

# 프론트엔드 서비스 대기
if ! check_service "http://localhost:5713" "프론트엔드"; then
    print_warning "프론트엔드 서비스 응답 없음 (선택적)"
fi

echo ""
echo "1️⃣ 백엔드 API 테스트..."
echo "==============================="

# 헬스체크
print_info "헬스체크 테스트..."
health_response=$(curl -s http://localhost:4000/health)
if echo "$health_response" | grep -q "OK"; then
    print_success "헬스체크 통과"
else
    print_error "헬스체크 실패: $health_response"
    exit 1
fi

# 회원가입 테스트 (테스트용 계정)
print_info "회원가입 테스트..."
test_email="tester_$(date +%s)@test.com"  # 시간 기반 유니크 이메일
signup_response=$(curl -s -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$test_email\",\"password\":\"test123\",\"nickname\":\"자동테스터\"}")

if echo "$signup_response" | grep -q "회원가입 성공"; then
    print_success "회원가입 API 동작"
else
    print_warning "회원가입 테스트 결과: $signup_response"
fi

# 기본 관리자 계정으로 로그인 테스트
print_info "로그인 테스트 (기본 계정)..."
login_response=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}')

if echo "$login_response" | grep -q "token"; then
    print_success "로그인 API 동작"
    
    # 토큰 추출 (더 안전한 방법)
    token=$(echo "$login_response" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$token" ]; then
        print_error "토큰 추출 실패"
        exit 1
    fi
    
    print_info "인증 토큰 획득 성공"
    
    # TODO 조회 테스트
    print_info "TODO API 테스트..."
    todos_response=$(curl -s -H "Authorization: Bearer $token" \
      http://localhost:4000/me/todos)
    
    if echo "$todos_response" | grep -q "\["; then
        print_success "TODO API 동작"
    else
        print_error "TODO API 오류: $todos_response"
    fi
    
    # TODO 생성 테스트
    print_info "TODO 생성 테스트..."
    todo_create_response=$(curl -s -X POST http://localhost:4000/me/todos \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d '{"title":"테스트 할일","description":"자동 테스트로 생성된 할일","startDate":"2025-08-18","endDate":"2025-08-25"}')
    
    if echo "$todo_create_response" | grep -q "테스트 할일"; then
        print_success "TODO 생성 API 동작"
    else
        print_error "TODO 생성 API 오류: $todo_create_response"
    fi
    
    # 채팅방 조회 테스트
    print_info "채팅방 API 테스트..."
    rooms_response=$(curl -s -H "Authorization: Bearer $token" \
      http://localhost:4000/chat/rooms)
    
    if echo "$rooms_response" | grep -q "\["; then
        print_success "채팅 API 동작"
    else
        print_error "채팅 API 오류: $rooms_response"
    fi
    
    # 간트차트 API 테스트
    print_info "간트차트 API 테스트..."
    gantt_response=$(curl -s -H "Authorization: Bearer $token" \
      http://localhost:4000/gantt)
    
    if echo "$gantt_response" | grep -q "\["; then
        print_success "간트차트 API 동작"
    else
        print_error "간트차트 API 오류: $gantt_response"
    fi
    
    # 팀원 조회 테스트
    print_info "팀원 API 테스트..."
    members_response=$(curl -s -H "Authorization: Bearer $token" \
      http://localhost:4000/team/members)
    
    if echo "$members_response" | grep -q "\["; then
        print_success "팀원 API 동작"
    else
        print_error "팀원 API 오류: $members_response"
    fi
    
else
    print_error "로그인 API 실패. 기본 관리자 계정이 없을 수 있습니다."
    print_info "기본 계정 생성을 위해 다음 명령어를 실행하세요:"
    echo "docker-compose exec backend node -e \"
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function createAdmin() {
  const db = mysql.createPool({
    host: 'db',
    user: 'user', 
    password: 'pass',
    database: 'appdb'
  });
  
  const hashedPassword = await bcrypt.hash('password123', 10);
  await db.execute(
    'INSERT IGNORE INTO users (email, password, nickname) VALUES (?, ?, ?)',
    ['admin@example.com', hashedPassword, '관리자']
  );
  console.log('관리자 계정 생성 완료');
  process.exit(0);
}

createAdmin();
\""
fi

echo ""
echo "2️⃣ Socket.IO 연결 테스트..."
echo "==============================="
print_info "Socket.IO 포트 5000 확인..."
if nc -z localhost 5000 2>/dev/null; then
    print_success "Socket.IO 서버 포트 열림"
else
    print_error "Socket.IO 서버 포트 5000이 열리지 않음"
fi

echo ""
echo "3️⃣ 프론트엔드 테스트..."
echo "========================"
frontend_response=$(curl -s -w "%{http_code}" http://localhost:5173 -o /dev/null)

if [ "$frontend_response" == "200" ]; then
    print_success "프론트엔드 서버 응답 (HTTP 200)"
elif [ "$frontend_response" == "000" ]; then
    print_error "프론트엔드 서버에 연결할 수 없음"
else
    print_warning "프론트엔드 서버 응답 이상 (HTTP: $frontend_response)"
fi

echo ""
echo "🎉 배포 테스트 완료!"
echo "================================================"
echo ""
echo "📱 서비스 접속 정보:"
echo "   🌐 웹사이트: http://localhost:5173"
echo "   🔌 API: http://localhost:4000"
echo "   💬 Socket.IO: http://localhost:5000"
echo "   👤 테스트 계정: admin@example.com / password123"
echo ""
echo "🔧 관리 명령어:"
echo "   📋 로그 확인: docker-compose logs -f [service]"
echo "   🔄 서비스 재시작: docker-compose restart [service]"
echo "   ⏹️ 서비스 중지: docker-compose down"
echo "   🗄️ DB 접속: docker-compose exec db mysql -u user -ppass appdb"
echo ""
echo "🐛 문제 해결:"
echo "   • API 오류 시: docker-compose logs backend"
echo "   • DB 연결 오류 시: docker-compose logs db"
echo "   • 프론트엔드 오류 시: docker-compose logs frontend"