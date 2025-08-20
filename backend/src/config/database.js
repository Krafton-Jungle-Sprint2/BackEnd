// src/config/database.js - 데이터베이스 설정 강화
const { PrismaClient } = require("@prisma/client");
const { config } = require("./env");

// Prisma 클라이언트 생성 (연결 풀 및 타임아웃 설정)
const prisma = new PrismaClient({
  log: config.server.nodeEnv === "development" 
    ? ["query", "info", "warn", "error"] 
    : ["error"],
  errorFormat: "pretty",
  datasources: {
    db: {
      url: config.database.url,
    },
  },
  // 연결 풀 설정
  __internal: {
    engine: {
      connectionLimit: config.database.poolSize,
      connectionTimeout: config.database.connectionTimeout,
      queryTimeout: config.database.queryTimeout,
    },
  },
});

// 데이터베이스 연결 테스트 (재시도 로직 포함)
async function connectDatabase(maxRetries = 3, retryDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔌 데이터베이스 연결 시도 ${attempt}/${maxRetries}...`);
      await prisma.$connect();
      console.log("✅ 데이터베이스 연결 성공");
      return true;
    } catch (error) {
      console.error(`❌ 데이터베이스 연결 실패 (시도 ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt === maxRetries) {
        console.error("❌ 최대 재시도 횟수 초과. 서버를 종료합니다.");
        process.exit(1);
      }
      
      console.log(`⏳ ${retryDelay/1000}초 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
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

// 데이터베이스 상태 확인 (상세 정보 포함)
async function checkDatabaseHealth() {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;
    
    // 데이터베이스 통계 조회
    const stats = await getDatabaseStats();
    
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      stats: stats,
      connectionPool: {
        active: prisma._engineConfig?.connectionLimit || 'unknown',
        idle: 'unknown', // Prisma에서 직접 제공하지 않음
      }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
      errorCode: error.code,
      errorStack: error.stack,
    };
  }
}

// 트랜잭션 헬퍼 함수 (재시도 로직 포함)
async function executeTransaction(callback, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await prisma.$transaction(callback);
      return { success: true, data: result, attempt };
    } catch (error) {
      console.error(`트랜잭션 실행 오류 (시도 ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        return { success: false, error: error.message, attempt };
      }
      
      // 일시적인 오류인 경우 재시도
      if (error.code === 'P2034' || error.code === 'P2037') {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      // 치명적인 오류인 경우 즉시 반환
      return { success: false, error: error.message, attempt };
    }
  }
}

// 데이터베이스 통계 조회 (에러 처리 강화)
async function getDatabaseStats() {
  try {
    const stats = await prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM workspaces) as total_workspaces,
        (SELECT COUNT(*) FROM personal_todos) as total_personal_todos,
        (SELECT COUNT(*) FROM group_tasks) as total_group_tasks,
        (SELECT COUNT(*) FROM friends WHERE status = 'accepted') as total_friendships,
        (SELECT COUNT(*) FROM refresh_tokens) as total_refresh_tokens
    `;
    
    return stats[0];
  } catch (error) {
    console.error("데이터베이스 통계 조회 오류:", error);
    return {
      total_users: 'unknown',
      total_workspaces: 'unknown',
      total_personal_todos: 'unknown',
      total_group_tasks: 'unknown',
      total_friendships: 'unknown',
      total_refresh_tokens: 'unknown',
      error: error.message
    };
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

// 데이터베이스 연결 상태 모니터링
function startHealthMonitoring(intervalMs = 30000) {
  const interval = setInterval(async () => {
    try {
      const health = await checkDatabaseHealth();
      if (health.status === 'unhealthy') {
        console.error('⚠️  데이터베이스 상태 불량 감지:', health.error);
      }
    } catch (error) {
      console.error('❌ 헬스 체크 모니터링 오류:', error);
    }
  }, intervalMs);

  // 프로세스 종료 시 정리
  process.on('beforeExit', () => {
    clearInterval(interval);
  });

  return interval;
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth,
  executeTransaction,
  getDatabaseStats,
  cleanupExpiredData,
  startHealthMonitoring,
};
