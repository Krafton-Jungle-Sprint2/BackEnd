// my-backend/src/app.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
require("dotenv").config();

// ===== 1. API 서버를 위한 Express 앱 생성 =====
const app = express();

// ===== 2. Socket.IO만을 위한 별도의 서버 생성 =====
const socketServer = http.createServer(); // Express 앱을 전달하지 않은, 비어있는 http 서버
const io = socketIo(socketServer, {
  cors: {
    origin: "*", // 모든 출처 허용
    methods: ["GET", "POST"],
  },
});

// 미들웨어 (API 서버에만 적용)
app.use(cors());
app.use(express.json());

// 루트 경로("/")에 대한 GET 요청을 처리하는 라우터
app.get("/", (req, res) => {
  res.send("API 서버가 정상적으로 작동합니다!");
});

// MySQL 연결
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "my_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "secret_key", (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ===============================================
//   Express를 사용하는 모든 API 라우트는 여기에 그대로 둡니다.
//   (인증, TODO, 간트차트, 채팅방 API 등)
// ===============================================
// ... (이전과 동일한 모든 app.get, app.post, app.put, app.delete 코드) ...
app.post("/api/auth/register", async (req, res) => {
  /* ... */
});
app.post("/api/auth/login", async (req, res) => {
  /* ... */
});
app.get("/api/todos", authenticateToken, async (req, res) => {
  /* ... */
});
// ... 이하 모든 API 라우트 코드 ...

// ==================== Socket.IO 채팅 로직 ====================
// 이 부분은 이제 API 서버(app)가 아닌 별도의 socketServer와 연결됩니다.
io.on("connection", (socket) => {
  console.log("Socket.IO 사용자가 연결되었습니다:", socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    socket.emit("joined_room", roomId);
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
  });

  socket.on("send_message", async (data) => {
    try {
      const { roomId, message, userId, userNickname } = data;
      const [result] = await db.execute(
        "INSERT INTO chat_messages (room_id, user_id, message) VALUES (?, ?, ?)",
        [roomId, userId, message]
      );
      const newMessage = {
        id: result.insertId,
        room_id: roomId,
        user_id: userId,
        message,
        user_nickname: userNickname,
        created_at: new Date(),
      };
      io.to(roomId).emit("receive_message", newMessage);
    } catch (error) {
      socket.emit("error", { message: "메시지 전송 실패" });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket.IO 사용자 연결이 해제되었습니다:", socket.id);
  });
});

// 헬스체크 (API 서버에만 존재)
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ===== 3. 두 개의 서버를 각각 다른 포트에서 실행 =====
const API_PORT = process.env.API_PORT || 4000;
const SOCKET_PORT = process.env.SOCKET_PORT || 5000;

// API 서버 실행
app.listen(API_PORT, () => {
  console.log(`🚀 API 서버가 http://localhost:${API_PORT} 에서 실행 중입니다.`);
});

// Socket.IO 서버 실행
socketServer.listen(SOCKET_PORT, () => {
  console.log(
    `💬 Socket.IO 서버가 http://localhost:${SOCKET_PORT} 에서 실행 중입니다.`
  );
});
