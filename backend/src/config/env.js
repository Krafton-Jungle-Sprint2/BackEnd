// src/config/env.js - 환경 변수 검증 및 기본값 설정
// Docker 환경에서는 .env 파일이 없을 수 있으므로 dotenv 로딩을 선택적으로 처리
try {
  require("dotenv").config();
} catch (error) {
  console.log(
    "ℹ️  .env 파일을 찾을 수 없습니다. Docker 환경 변수를 사용합니다."
  );
}

// 필수 환경 변수 검증
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET"];

// 누락된 환경 변수 확인
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error("❌ 필수 환경 변수가 누락되었습니다:", missingEnvVars);
  console.error("📝 Docker Compose의 environment 섹션을 확인하세요.");
  console.error(
    "현재 환경 변수:",
    Object.keys(process.env).filter(
      (key) => key.includes("JWT") || key.includes("DATABASE")
    )
  );
  process.exit(1);
}

// 환경 변수 기본값 설정
const config = {
  // 데이터베이스
  database: {
    url: process.env.DATABASE_URL,
    shadowUrl: process.env.SHADOW_DATABASE_URL || process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE) || 10,
    connectionTimeout:
      parseInt(process.env.DATABASE_CONNECTION_TIMEOUT) || 30000,
    queryTimeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT) || 30000,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.REFRESH_TOKEN_SECRET,
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  },

  // 서버
  server: {
    apiPort: parseInt(process.env.API_PORT) || 4000,
    socketPort: parseInt(process.env.SOCKET_PORT) || 5000,
    nodeEnv: process.env.NODE_ENV || "development",
  },

  // CORS
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  },
};

// 환경 변수 유효성 검증
function validateConfig() {
  console.log("🔍 환경 변수 검증 중...");
  console.log("📊 현재 설정:");
  console.log(
    `   - DATABASE_URL: ${config.database.url ? "✅ 설정됨" : "❌ 누락"}`
  );
  console.log(
    `   - JWT_SECRET: ${config.jwt.secret ? "✅ 설정됨" : "❌ 누락"}`
  );
  console.log(
    `   - REFRESH_TOKEN_SECRET: ${
      config.jwt.refreshSecret ? "✅ 설정됨" : "❌ 누락"
    }`
  );

  // JWT 시크릿 키 길이 검증
  if (config.jwt.secret && config.jwt.secret.length < 32) {
    console.warn(
      "⚠️  JWT_SECRET이 너무 짧습니다. 보안을 위해 최소 32자 이상을 권장합니다."
    );
  }

  if (config.jwt.refreshSecret && config.jwt.refreshSecret.length < 32) {
    console.warn(
      "⚠️  REFRESH_TOKEN_SECRET이 너무 짧습니다. 보안을 위해 최소 32자 이상을 권장합니다."
    );
  }

  // 데이터베이스 URL 형식 검증
  if (config.database.url && !config.database.url.includes("mysql://")) {
    console.error("❌ DATABASE_URL이 올바른 MySQL 형식이 아닙니다.");
    process.exit(1);
  }

  console.log("✅ 환경 변수 검증 완료");
  return true;
}

// 설정 내보내기
module.exports = {
  config,
  validateConfig,
  requiredEnvVars,
  missingEnvVars,
};
