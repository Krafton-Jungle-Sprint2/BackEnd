const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const helmet = require("helmet"); // helmet 추가
const rateLimit = require("express-rate-limit"); // express-rate-limit 추가
const morgan = require("morgan"); //  Logging을 위한 morgan 추가
const setupChatServer = require("./chat-server"); // 1. 채팅 서버 설정 함수 불러오기
require("dotenv").config();

// 라우터 import
const { router: authRoutes } = require("./auth");
const todoRoutes = require("./todos");
const ganttRoutes = require("./gantt");

const app = express();
const PORT = process.env.API_PORT || 4000;

// 보안 미들웨어
app.use(helmet());

// CORS 설정
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://frontend:3000", // Docker 컨테이너 통신용
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Morgan을 이용한 HTTP 요청 로깅
// 개발 환경에서는 'dev' 포맷으로, 프로덕션 환경에서는 'combined' 포맷으로 로그를 남깁니다.
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100 requests per 15분
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN" 형식

  if (token == null) {
    return res.status(401).json({ error: "Authentication token is required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // 에러 핸들러가 TokenExpiredError, JsonWebTokenError를 처리하므로 next로 에러를 전달합니다.
      return next(err);
    }
    req.user = user; // 요청 객체에 인증된 사용자 정보를 저장합니다.
    next();
  });
};

// API 라우터 등록
app.use("/api/auth", authRoutes); // 인증 라우트는 authenticateToken 미들웨어가 필요 없습니다.
app.use("/api", authenticateToken, todoRoutes); // todoRoutes는 이제 인증이 필요합니다.
app.use("/api", authenticateToken, ganttRoutes); // ganttRoutes도 이제 인증이 필요합니다.

// 404 핸들러
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// 글로벌 에러 핸들링 미들웨어
app.use((error, req, res, next) => {
  console.error("Error:", error);

  if (error.name === "ValidationError") {
    return res.status(400).json({ error: error.message });
  }

  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" });
  }

  if (error.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired" });
  }

  // Prisma 에러 처리
  if (error.code === "P2002") {
    return res.status(409).json({ error: "Resource already exists" });
  }

  if (error.code === "P2025") {
    return res.status(404).json({ error: "Resource not found" });
  }

  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { details: error.message }),
  });
});

// HTTP 서버 생성 및 Socket.IO 연결
const server = http.createServer(app);
const io = new socketIo(server, {
  cors: corsOptions, // 기존 CORS 설정 재사용
});

// Socket.IO 네임스페이스 및 이벤트 핸들러 설정
const ganttNamespace = io.of("/gantt");
ganttNamespace.on("connection", (socket) => {
  console.log("A user connected to the Gantt chart namespace");

  // 프론트엔드에서 'task_updated' 이벤트를 받으면 다른 클라이언트들에게 'task_change' 이벤트를 보냄
  socket.on("task_updated", (data) => {
    socket.broadcast.emit("task_change", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected from the Gantt chart namespace");
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});
