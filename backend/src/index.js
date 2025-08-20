// src/index.js - 서버 시작점 강화
require("dotenv").config();
const { config, validateConfig } = require("./config/env");
const app = require("./app");
const http = require("http");
const { initializeSocket } = require("./socket");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

// 환경 변수 검증
console.log("🔍 환경 변수 검증 중...");
validateConfig();

const prisma = new PrismaClient();

// HTTP 서버들 생성
const apiServer = http.createServer(app);
const socketServer = http.createServer();

// Socket.IO 초기화
const io = initializeSocket(socketServer);

const API_PORT = config.server.apiPort;
const SOCKET_PORT = config.server.socketPort;

// 기본 데이터 생성 함수
async function createDefaultData() {
  try {
    console.log("📝 기본 데이터 생성 중...");
    
    // 관리자 계정 생성 (이미 있으면 스킵)
    const adminExists = await prisma.user.findUnique({
      where: { email: "admin@example.com" },
    });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("password123", 10);
      await prisma.user.create({
        data: {
          email: "admin@example.com",
          password: hashedPassword,
          nickname: "관리자",
          role: "admin",
        },
      });
      console.log("✅ 관리자 계정 생성 완료");
    } else {
      console.log("ℹ️  관리자 계정이 이미 존재합니다");
    }

    // 테스트 사용자 생성
    const testUserExists = await prisma.user.findUnique({
      where: { email: "test@example.com" },
    });

    if (!testUserExists) {
      const hashedPassword = await bcrypt.hash("password123", 10);
      await prisma.user.create({
        data: {
          email: "test@example.com",
          password: hashedPassword,
          nickname: "테스트유저",
          role: "member",
        },
      });
      console.log("✅ 테스트 사용자 생성 완료");
    } else {
      console.log("ℹ️  테스트 사용자가 이미 존재합니다");
    }
    
    console.log("✅ 기본 데이터 생성 완료");
  } catch (error) {
    console.error("❌ 기본 데이터 생성 오류:", error);
    // 기본 데이터 생성 실패는 서버 시작을 막지 않음
  }
}

// 서버 시작 함수
async function startServer() {
  try {
    console.log("🚀 서버 시작 중...");
    
    // Prisma 연결 테스트
    console.log("🔌 Prisma 연결 테스트...");
    await prisma.$connect();
    console.log("✅ Prisma 연결 성공");

    // 기본 데이터 생성
    await createDefaultData();

    // API 서버 시작
    apiServer.listen(API_PORT, () => {
      console.log(`🚀 API 서버: http://localhost:${API_PORT}`);
    });

    // Socket.IO 서버 시작
    socketServer.listen(SOCKET_PORT, () => {
      console.log(`💬 Socket.IO 서버: http://localhost:${SOCKET_PORT}`);
    });

    console.log("🎉 모든 서버가 성공적으로 시작되었습니다!");
    
    // 서버 정보 출력
    console.log("📊 서버 정보:");
    console.log(`   - Node.js 버전: ${process.version}`);
    console.log(`   - 환경: ${config.server.nodeEnv}`);
    console.log(`   - API 포트: ${API_PORT}`);
    console.log(`   - Socket 포트: ${SOCKET_PORT}`);
    console.log(`   - 데이터베이스: ${config.database.url.split('@')[1]}`);
    
  } catch (error) {
    console.error("❌ 서버 시작 실패:", error);
    
    // 상세한 오류 정보 출력
    if (error.code === 'P1001') {
      console.error("💡 데이터베이스 연결 실패. 다음을 확인하세요:");
      console.error("   1. 데이터베이스 서버가 실행 중인지 확인");
      console.error("   2. DATABASE_URL이 올바른지 확인");
      console.error("   3. 데이터베이스 사용자 권한 확인");
    } else if (error.code === 'P1002') {
      console.error("💡 데이터베이스 인증 실패. 다음을 확인하세요:");
      console.error("   1. 데이터베이스 사용자명과 비밀번호 확인");
      console.error("   2. 데이터베이스 사용자 권한 확인");
    } else if (error.code === 'P1003') {
      console.error("💡 데이터베이스가 존재하지 않습니다. 다음을 확인하세요:");
      console.error("   1. 데이터베이스가 생성되었는지 확인");
      console.error("   2. DATABASE_URL의 데이터베이스명 확인");
    }
    
    process.exit(1);
  }
}

// 앱 종료 시 정리 작업
async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} 신호를 받았습니다. 서버를 안전하게 종료합니다...`);
  
  try {
    // HTTP 서버 종료
    apiServer.close(() => {
      console.log("✅ API 서버 종료 완료");
    });
    
    socketServer.close(() => {
      console.log("✅ Socket.IO 서버 종료 완료");
    });
    
    // Prisma 연결 해제
    await prisma.$disconnect();
    console.log("✅ 데이터베이스 연결 해제 완료");
    
    console.log("✅ 모든 리소스 정리 완료");
    process.exit(0);
  } catch (error) {
    console.error("❌ 서버 종료 중 오류 발생:", error);
    process.exit(1);
  }
}

// 프로세스 종료 신호 처리
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

// 예상치 못한 오류 처리
process.on("uncaughtException", (error) => {
  console.error("❌ 예상치 못한 오류 발생:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ 처리되지 않은 Promise 거부:", reason);
  gracefulShutdown("unhandledRejection");
});

// 서버 시작
startServer();
