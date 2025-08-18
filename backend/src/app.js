// my-backend/src/app.js - Prisma 버전
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

// Prisma 클라이언트 초기화
const prisma = new PrismaClient();

// ===== Express 앱 및 Socket.IO 서버 생성 =====
const app = express();
const socketServer = http.createServer();
const io = socketIo(socketServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// 미들웨어
app.use(cors());
app.use(express.json());

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "인증 토큰이 필요합니다" });
  }

  jwt.verify(token, process.env.JWT_SECRET || "secret_key", (err, user) => {
    if (err) {
      return res.status(403).json({ error: "유효하지 않은 토큰입니다" });
    }
    req.user = user;
    next();
  });
};

// 루트 경로
app.get("/", (req, res) => {
  res.json({ message: "Prisma 기반 API 서버가 정상 작동합니다!" });
});

// ===============================================
//   인증 API
// ===============================================

// 회원가입
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    // 입력 검증
    if (!email || !password || !nickname) {
      return res
        .status(400)
        .json({ error: "이메일, 비밀번호, 닉네임은 필수입니다" });
    }

    // 이메일 중복 확인
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: "이미 존재하는 이메일입니다" });
    }

    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(password, 10);

    // 사용자 생성
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      message: "회원가입 성공",
      user,
    });
  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

// 로그인
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 입력 검증
    if (!email || !password) {
      return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다" });
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    // 계정 활성화 확인
    if (!user.isActive) {
      return res.status(401).json({ error: "비활성화된 계정입니다" });
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    // 마지막 로그인 시간 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

// ===============================================
//   ToDo API
// ===============================================

// ToDo 목록 조회
app.get("/api/todos", authenticateToken, async (req, res) => {
  try {
    const { status, priority } = req.query;

    const whereClause = {
      userId: req.user.userId,
    };

    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;

    const todos = await prisma.todo.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            nickname: true,
          },
        },
      },
    });

    res.json(todos);
  } catch (error) {
    console.error("ToDo 조회 오류:", error);
    res.status(500).json({ error: "ToDo 조회에 실패했습니다" });
  }
});

// ToDo 생성
app.post("/api/todos", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      priority = "medium",
      estimatedHours,
      tags,
    } = req.body;

    // 입력 검증
    if (!title || !endDate) {
      return res.status(400).json({ error: "제목과 종료일은 필수입니다" });
    }

    const todo = await prisma.todo.create({
      data: {
        title,
        description,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: new Date(endDate),
        priority,
        estimatedHours,
        tags: tags ? JSON.stringify(tags) : null,
        userId: req.user.userId,
      },
      include: {
        user: {
          select: {
            nickname: true,
          },
        },
      },
    });

    res.status(201).json(todo);
  } catch (error) {
    console.error("ToDo 생성 오류:", error);
    res.status(500).json({ error: "ToDo 생성에 실패했습니다" });
  }
});

// ToDo 수정
app.put("/api/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      startDate,
      endDate,
      progress,
      actualHours,
      tags,
    } = req.body;

    // 권한 확인
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "ToDo를 찾을 수 없습니다" });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (progress !== undefined)
      updateData.progress = Math.max(0, Math.min(100, progress));
    if (actualHours !== undefined) updateData.actualHours = actualHours;
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);

    const updatedTodo = await prisma.todo.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            nickname: true,
          },
        },
      },
    });

    res.json(updatedTodo);
  } catch (error) {
    console.error("ToDo 수정 오류:", error);
    res.status(500).json({ error: "ToDo 수정에 실패했습니다" });
  }
});

// ToDo 삭제
app.delete("/api/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 권한 확인
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "ToDo를 찾을 수 없습니다" });
    }

    await prisma.todo.delete({
      where: { id },
    });

    res.json({ message: "ToDo가 삭제되었습니다" });
  } catch (error) {
    console.error("ToDo 삭제 오류:", error);
    res.status(500).json({ error: "ToDo 삭제에 실패했습니다" });
  }
});

// ToDo 통계
app.get("/api/todos/stats", authenticateToken, async (req, res) => {
  try {
    const stats = await prisma.todo.groupBy({
      by: ["status"],
      where: {
        userId: req.user.userId,
      },
      _count: {
        id: true,
      },
    });

    const result = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      total: 0,
    };

    stats.forEach((stat) => {
      result[stat.status] = stat._count.id;
      result.total += stat._count.id;
    });

    res.json(result);
  } catch (error) {
    console.error("ToDo 통계 오류:", error);
    res.status(500).json({ error: "통계 조회에 실패했습니다" });
  }
});

// ===============================================
//   간트차트 API
// ===============================================

// 간트차트 데이터
app.get("/api/gantt", authenticateToken, async (req, res) => {
  try {
    const todos = await prisma.todo.findMany({
      where: {
        userId: req.user.userId,
        startDate: { not: null },
        endDate: { not: null },
      },
      orderBy: { startDate: "asc" },
      include: {
        user: {
          select: {
            nickname: true,
          },
        },
      },
    });

    const ganttData = todos.map((todo) => ({
      id: todo.id,
      name: todo.title,
      start: todo.startDate,
      end: todo.endDate,
      status: todo.status,
      priority: todo.priority,
      progress: todo.progress,
      assignee: todo.user.nickname,
      duration: Math.ceil(
        (new Date(todo.endDate) - new Date(todo.startDate)) /
          (1000 * 60 * 60 * 24)
      ),
      estimatedHours: todo.estimatedHours,
      actualHours: todo.actualHours,
    }));

    res.json(ganttData);
  } catch (error) {
    console.error("간트차트 데이터 오류:", error);
    res.status(500).json({ error: "간트차트 데이터 조회에 실패했습니다" });
  }
});

// ===============================================
//   채팅 API
// ===============================================

// 채팅방 목록
app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                nickname: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    const roomsWithLastMessage = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      isPrivate: room.isPrivate,
      createdAt: room.createdAt,
      messageCount: room._count.messages,
      lastMessage: room.messages[0] || null,
    }));

    res.json(roomsWithLastMessage);
  } catch (error) {
    console.error("채팅방 목록 오류:", error);
    res.status(500).json({ error: "채팅방 목록 조회에 실패했습니다" });
  }
});

// 채팅방 생성
app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const { name, description, isPrivate = false } = req.body;

    if (!name) {
      return res.status(400).json({ error: "채팅방 이름은 필수입니다" });
    }

    const room = await prisma.chatRoom.create({
      data: {
        name,
        description,
        isPrivate,
      },
    });

    res.status(201).json(room);
  } catch (error) {
    console.error("채팅방 생성 오류:", error);
    res.status(500).json({ error: "채팅방 생성에 실패했습니다" });
  }
});

// 채팅방 메시지 조회
app.get(
  "/api/chat/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    try {
      const { roomId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const cursor = req.query.cursor; // 페이지네이션용

      const whereClause = { roomId };
      const orderBy = { createdAt: "desc" };

      let messages;

      if (cursor) {
        messages = await prisma.chatMessage.findMany({
          where: {
            ...whereClause,
            createdAt: { lt: new Date(cursor) },
          },
          take: limit,
          orderBy,
          include: {
            user: {
              select: {
                nickname: true,
                avatar: true,
              },
            },
          },
        });
      } else {
        messages = await prisma.chatMessage.findMany({
          where: whereClause,
          take: limit,
          orderBy,
          include: {
            user: {
              select: {
                nickname: true,
                avatar: true,
              },
            },
          },
        });
      }

      // 시간순으로 정렬 (최신이 아래)
      res.json(messages.reverse());
    } catch (error) {
      console.error("메시지 조회 오류:", error);
      res.status(500).json({ error: "메시지 조회에 실패했습니다" });
    }
  }
);

// ===============================================
//   사용자/팀 API
// ===============================================

// 프로필 조회
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        role: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    }

    res.json(user);
  } catch (error) {
    console.error("프로필 조회 오류:", error);
    res.status(500).json({ error: "프로필 조회에 실패했습니다" });
  }
});

// 프로필 수정
app.put("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const { nickname, avatar } = req.body;

    const updateData = {};
    if (nickname) updateData.nickname = nickname;
    if (avatar !== undefined) updateData.avatar = avatar;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        role: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("프로필 수정 오류:", error);
    res.status(500).json({ error: "프로필 수정에 실패했습니다" });
  }
});

// 팀원 목록
app.get("/api/team/members", authenticateToken, async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        role: true,
        lastLogin: true,
        createdAt: true,
      },
      orderBy: { nickname: "asc" },
    });

    res.json(members);
  } catch (error) {
    console.error("팀원 조회 오류:", error);
    res.status(500).json({ error: "팀원 조회에 실패했습니다" });
  }
});

// 헬스체크
app.get("/health", async (req, res) => {
  try {
    // DB 연결 확인
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      database: "connected",
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

// ===============================================
//   Socket.IO (간단 버전)
// ===============================================

io.on("connection", (socket) => {
  console.log(`💬 Socket 연결: ${socket.id}`);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    socket.emit("joined_room", roomId);
    console.log(`방 ${roomId} 입장: ${socket.id}`);
  });

  socket.on("send_message", async (data) => {
    try {
      const { roomId, message, userId } = data;

      // 사용자 정보 조회
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true, avatar: true },
      });

      if (!user) {
        socket.emit("error", { message: "사용자를 찾을 수 없습니다" });
        return;
      }

      // 메시지 저장
      const newMessage = await prisma.chatMessage.create({
        data: {
          text: message,
          roomId,
          userId,
        },
        include: {
          user: {
            select: {
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      // 방의 모든 사용자에게 전송
      io.to(roomId).emit("receive_message", newMessage);
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      socket.emit("error", { message: "메시지 전송 실패" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`👋 Socket 연결 해제: ${socket.id}`);
  });
});

// ===============================================
//   서버 시작
// ===============================================

const API_PORT = process.env.API_PORT || 4000;
const SOCKET_PORT = process.env.SOCKET_PORT || 5000;

// Prisma 연결 테스트 및 초기 데이터 생성
async function initializeApp() {
  try {
    console.log("🔌 Prisma 연결 테스트...");
    await prisma.$connect();
    console.log("✅ Prisma 연결 성공");

    // 기본 데이터 생성
    await createDefaultData();

    // API 서버 시작
    app.listen(API_PORT, () => {
      console.log(`🚀 API 서버: http://localhost:${API_PORT}`);
    });

    // Socket.IO 서버 시작
    socketServer.listen(SOCKET_PORT, () => {
      console.log(`💬 Socket.IO 서버: http://localhost:${SOCKET_PORT}`);
    });
  } catch (error) {
    console.error("❌ 앱 초기화 실패:", error);
    process.exit(1);
  }
}

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

    // 기본 채팅방 생성
    const generalRoomExists = await prisma.chatRoom.findFirst({
      where: { name: "일반 채팅" },
    });

    if (!generalRoomExists) {
      await prisma.chatRoom.create({
        data: {
          name: "일반 채팅",
          description: "모든 팀원이 참여할 수 있는 일반 채팅방입니다",
        },
      });
      console.log("✅ 기본 채팅방 생성 완료");
    }
  } catch (error) {
    console.error("기본 데이터 생성 오류:", error);
  }
}

// 앱 종료 시 Prisma 연결 해제
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

// 앱 시작
initializeApp();
