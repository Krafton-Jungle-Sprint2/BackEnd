// backend/src/chat-server.js

// 필요한 모듈들을 불러옵니다.
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();

// app과 io 객체를 파라미터로 받도록 함수를 수정합니다.
function setupChatServer(app, io) {
  // ==================== API 라우트 등록 ====================
  // 이 라우트들은 이제 메인 app 객체에 등록됩니다.
  app.get("/api/rooms", async (req, res) => {
    try {
      const rooms = await prisma.chatRoom.findMany({
        /* ... 기존 코드와 동일 ... */
      });
      res.json(rooms);
    } catch (error) {
      console.error("Get rooms error:", error);
      res.status(500).json({ error: "Failed to get rooms" });
    }
  });

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

  // ==================== Socket.IO 로직 등록 ====================
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

  // Socket.IO 미들웨어 및 이벤트 핸들러
  io.use(verifySocketToken);

  io.on("connection", async (socket) => {
    console.log(`User ${socket.userNickname} connected`);

    // "join_room", "send_message" 등 모든 socket.on 이벤트는
    // 여기에 그대로 둡니다.
    // ... 기존 소켓 이벤트 핸들러 코드 ...
    socket.on("join_room", async (roomId) => {
      /* ... */
    });
    socket.on("send_message", async (data) => {
      /* ... */
    });
    socket.on("typing_start", (roomId) => {
      /* ... */
    });
    socket.on("typing_stop", (roomId) => {
      /* ... */
    });
    socket.on("disconnect", () => {
      /* ... */
    });
  });
}

// 수정한 함수를 export 합니다.
module.exports = setupChatServer;
