// src/index.js - 서버 시작점
require("dotenv").config();
const app = require("./app");
const http = require("http");
const { initializeSocket } = require("./socket");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

// HTTP 서버들 생성
const apiServer = http.createServer(app);
const socketServer = http.createServer();

// Socket.IO 초기화
const io = initializeSocket(socketServer);

const API_PORT = process.env.API_PORT || 4000;
const SOCKET_PORT = process.env.SOCKET_PORT || 5000;

// 기본 데이터 생성 함수
async function createDefaultData() {
  try {
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
    }
  } catch (error) {
    console.error("기본 데이터 생성 오류:", error);
  }
}

// 서버 시작 함수
async function startServer() {
  try {
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
  } catch (error) {
    console.error("❌ 서버 시작 실패:", error);
    process.exit(1);
  }
}

// 앱 종료 시 Prisma 연결 해제
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  console.log("\n🛑 서버 종료 중...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 서버 종료 중...");
  await prisma.$disconnect();
  process.exit(0);
});

// 서버 시작
startServer();
