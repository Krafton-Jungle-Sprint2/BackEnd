// src/config/database.js - 데이터베이스 설정
const { PrismaClient } = require("@prisma/client");

// Prisma 클라이언트 생성
const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
  errorFormat: "pretty",
});

// 데이터베이스 연결 테스트
async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log("✅ 데이터베이스 연결 성공");
    return true;
  } catch (error) {
    console.error("❌ 데이터베이스 연결 실패:", error);
    return false;
  }
}

// 데이터베이스 연결 해제
async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log("✅ 데이터베이스 연결 해제 완료");
  } catch (error) {
    console.error("❌ 데이터베이스 연결 해제 실패:", error);
  }
}

// 데이터베이스 상태 확인
async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

// 트랜잭션 헬퍼 함수
async function executeTransaction(callback) {
  try {
    const result = await prisma.$transaction(callback);
    return { success: true, data: result };
  } catch (error) {
    console.error("트랜잭션 실행 오류:", error);
    return { success: false, error: error.message };
  }
}

// 데이터베이스 통계 조회
async function getDatabaseStats() {
  try {
    const stats = await prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM workspaces) as total_workspaces,
        (SELECT COUNT(*) FROM personal_todos) as total_personal_todos,
        (SELECT COUNT(*) FROM group_tasks) as total_group_tasks,
        (SELECT COUNT(*) FROM friends WHERE status = 'accepted') as total_friendships
    `;

    return stats[0];
  } catch (error) {
    console.error("데이터베이스 통계 조회 오류:", error);
    return null;
  }
}

// 정리 작업 (만료된 토큰 등 삭제)
async function cleanupExpiredData() {
  try {
    // 만료된 리프레시 토큰 삭제
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    console.log(`🧹 만료된 리프레시 토큰 ${deletedTokens.count}개 삭제`);

    return { success: true, deletedTokens: deletedTokens.count };
  } catch (error) {
    console.error("데이터 정리 작업 오류:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth,
  executeTransaction,
  getDatabaseStats,
  cleanupExpiredData,
};
