// DAY 4: 채팅 서버 (Socket.IO) - 포트 5000
// ==============================================
// backend/src/chat-server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// JWT 검증 미들웨어
const verifySocketToken = (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("No token provided"));
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    socket.userId = decoded.userId;
    socket.userNickname = decoded.nickname;
    next();
  } catch (error) {
    next(new Error("Invalid token"));
  }
};

// Socket.IO 연결 처리
io.use(verifySocketToken);

io.on("connection", async (socket) => {
  console.log(`User ${socket.userNickname} connected`);

  // 채팅방 입장
  socket.on("join_room", async (roomId) => {
    try {
      socket.join(roomId);

      // 채팅방이 없으면 생성
      const room = await prisma.chatRoom.upsert({
        where: { id: roomId },
        update: {},
        create: {
          id: roomId,
          name: `Room ${roomId}`,
        },
      });

      // 최근 메시지 50개 가져오기
      const messages = await prisma.chatMessage.findMany({
        where: { roomId },
        include: {
          user: {
            select: { nickname: true, id: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      // 시간순 정렬해서 전송
      socket.emit("room_joined", {
        roomId,
        messages: messages.reverse(),
      });

      // 방에 있는 다른 사용자들에게 입장 알림
      socket.to(roomId).emit("user_joined", {
        userId: socket.userId,
        nickname: socket.userNickname,
      });
    } catch (error) {
      console.error("Join room error:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // 메시지 전송
  socket.on("send_message", async (data) => {
    try {
      const { roomId, text } = data;

      // DB에 메시지 저장
      const message = await prisma.chatMessage.create({
        data: {
          text,
          roomId,
          userId: socket.userId,
        },
        include: {
          user: {
            select: { nickname: true, id: true },
          },
        },
      });

      // 방에 있는 모든 사용자에게 메시지 전송
      io.to(roomId).emit("new_message", {
        id: message.id,
        text: message.text,
        createdAt: message.createdAt,
        user: message.user,
      });
    } catch (error) {
      console.error("Send message error:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // 타이핑 상태
  socket.on("typing_start", (roomId) => {
    socket.to(roomId).emit("user_typing", {
      userId: socket.userId,
      nickname: socket.userNickname,
    });
  });

  socket.on("typing_stop", (roomId) => {
    socket.to(roomId).emit("user_stop_typing", {
      userId: socket.userId,
    });
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log(`User ${socket.userNickname} disconnected`);
  });
});

// 채팅방 목록 API
app.get("/api/rooms", async (req, res) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { nickname: true } },
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    res.json(rooms);
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

// 새 채팅방 생성 API
app.post("/api/rooms", async (req, res) => {
  try {
    const { name } = req.body;

    const room = await prisma.chatRoom.create({
      data: { name },
    });

    res.json(room);
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});
