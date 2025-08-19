// src/app.js - 라우터 통합 버전
const express = require("express");
const cors = require("cors");
const { checkDatabaseHealth } = require("./config/database");

// 라우터 가져오기
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const friendsRouter = require("./routes/friends");
const todosRouter = require("./routes/todos");
const workspacesRouter = require("./routes/workspaces");
const tasksRouter = require("./routes/tasks");
const adminRouter = require("./routes/admin");

const app = express();

// 미들웨어
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// 요청 로깅 미들웨어 (개발 환경)
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// 루트 경로
app.get("/", (req, res) => {
  res.json({
    message: "Team Collaboration API Server",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/auth/*",
      users: "/users/*",
      friends: "/friends/*",
      todos: "/me/todos/*",
      workspaces: "/workspaces/*",
      admin: "/admin/*",
    },
  });
});

// API 라우터 등록
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/friends", friendsRouter);
app.use("/me/todos", todosRouter);
app.use("/workspaces", workspacesRouter);
app.use("/workspaces/:wsId/tasks", tasksRouter); // 워크스페이스별 Task
app.use("/admin", adminRouter);

// 헬스체크
app.get("/health", async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      database: dbHealth.status,
      version: "2.0.0",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error) {
    console.error("헬스체크 오류:", error);
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error.message,
    });
  }
});

// API 문서 (간단한 버전)
app.get("/docs", (req, res) => {
  res.json({
    title: "Team Collaboration API Documentation",
    version: "2.0.0",
    baseUrl: `${req.protocol}://${req.get("host")}`,
    endpoints: {
      auth: {
        "POST /auth/signup": "회원가입",
        "POST /auth/login": "로그인",
        "POST /auth/refresh": "토큰 갱신",
        "POST /auth/logout": "로그아웃",
      },
      users: {
        "GET /users/me": "내 정보 조회",
        "PATCH /users/me": "내 정보 수정",
        "GET /users/search": "사용자 검색",
        "GET /users/:userId": "사용자 정보 조회",
      },
      friends: {
        "POST /friends": "친구 요청",
        "GET /friends": "친구 목록",
        "PATCH /friends/:friendId": "친구 관계 변경",
        "DELETE /friends/:friendId": "친구 관계 삭제",
        "GET /friends/requests/received": "받은 친구 요청",
        "GET /friends/requests/sent": "보낸 친구 요청",
      },
      todos: {
        "GET /me/todos": "개인 Todo 목록",
        "POST /me/todos": "개인 Todo 생성",
        "GET /me/todos/:id": "개인 Todo 상세",
        "PATCH /me/todos/:id": "개인 Todo 수정",
        "DELETE /me/todos/:id": "개인 Todo 삭제",
        "GET /me/todos/stats/summary": "개인 Todo 통계",
      },
      workspaces: {
        "POST /workspaces": "워크스페이스 생성",
        "GET /workspaces": "내 워크스페이스 목록",
        "GET /workspaces/:wsId": "워크스페이스 상세",
        "PATCH /workspaces/:wsId": "워크스페이스 수정",
        "DELETE /workspaces/:wsId": "워크스페이스 삭제",
        "GET /workspaces/:wsId/members": "멤버 목록",
        "POST /workspaces/:wsId/members": "멤버 초대",
        "GET /workspaces/invitations/received": "받은 초대 목록",
      },
      tasks: {
        "GET /workspaces/:wsId/tasks": "단체 Task 목록",
        "POST /workspaces/:wsId/tasks": "단체 Task 생성",
        "GET /workspaces/:wsId/tasks/:taskId": "단체 Task 상세",
        "PATCH /workspaces/:wsId/tasks/:taskId": "단체 Task 수정",
        "DELETE /workspaces/:wsId/tasks/:taskId": "단체 Task 삭제",
        "GET /workspaces/:wsId/tasks/stats/summary": "Task 통계",
      },
      admin: {
        "GET /admin/stats": "시스템 통계",
        "GET /admin/users": "전체 사용자 목록",
        "PATCH /admin/users/:userId/status": "사용자 상태 변경",
        "GET /admin/workspaces": "전체 워크스페이스 목록",
        "POST /admin/cleanup": "시스템 정리",
      },
    },
    authentication: {
      type: "Bearer Token",
      header: "Authorization: Bearer <access_token>",
      note: "대부분의 API는 인증이 필요합니다.",
    },
  });
});

// 404 핸들러
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `경로 ${req.originalUrl}를 찾을 수 없습니다`,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      "/auth/*",
      "/users/*",
      "/friends/*",
      "/me/todos/*",
      "/workspaces/*",
      "/admin/*",
      "/health",
      "/docs",
    ],
  });
});

// 에러 핸들러
app.use((error, req, res, next) => {
  console.error("Express 에러:", error);

  // Prisma 에러 처리
  if (error.code === "P2002") {
    return res.status(409).json({
      error: "Conflict",
      message: "이미 존재하는 데이터입니다",
      timestamp: new Date().toISOString(),
    });
  }

  if (error.code === "P2025") {
    return res.status(404).json({
      error: "Not Found",
      message: "요청한 데이터를 찾을 수 없습니다",
      timestamp: new Date().toISOString(),
    });
  }

  // JWT 에러 처리
  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "Unauthorized",
      message: "유효하지 않은 토큰입니다",
      timestamp: new Date().toISOString(),
    });
  }

  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Token Expired",
      message: "토큰이 만료되었습니다",
      timestamp: new Date().toISOString(),
    });
  }

  // 기본 에러 응답
  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "서버 내부 오류가 발생했습니다",
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
