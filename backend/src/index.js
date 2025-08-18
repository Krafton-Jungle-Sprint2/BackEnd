// my-backend/src/app.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// 미들웨어
app.use(cors());
app.use(express.json());

// ===== 👇 이 부분을 추가했습니다. 👇 =====
// 루트 경로("/")에 대한 GET 요청을 처리하는 라우터
app.get("/", (req, res) => {
  res.send("서버가 정상적으로 작동합니다!");
});
// ======================================

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

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || "secret_key", (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ==================== 인증 API ====================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, nickname } = req.body; // 중복 체크

    const [existingUsers] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "이미 존재하는 이메일입니다" });
    } // 비밀번호 해시

    const hashedPassword = await bcrypt.hash(password, 10); // 사용자 생성

    const [result] = await db.execute(
      "INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)",
      [email, hashedPassword, nickname]
    );

    const token = jwt.sign(
      { userId: result.insertId, email },
      process.env.JWT_SECRET || "secret_key"
    );

    res.json({
      token,
      user: {
        id: result.insertId,
        email,
        nickname,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (users.length === 0) {
      return res.status(400).json({ error: "사용자를 찾을 수 없습니다" });
    }

    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(400).json({ error: "비밀번호가 틀렸습니다" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "secret_key"
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== TODO API ====================
app.get("/api/todos", authenticateToken, async (req, res) => {
  try {
    const [todos] = await db.execute(
      "SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.userId]
    );
    res.json(todos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/todos", authenticateToken, async (req, res) => {
  try {
    const { title, start_date, end_date, description } = req.body;

    const [result] = await db.execute(
      "INSERT INTO todos (title, start_date, end_date, description, user_id) VALUES (?, ?, ?, ?, ?)",
      [title, start_date, end_date, description || null, req.user.userId]
    );

    const [newTodo] = await db.execute("SELECT * FROM todos WHERE id = ?", [
      result.insertId,
    ]);

    res.status(201).json(newTodo[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { title, start_date, end_date, description, completed } = req.body;

    await db.execute(
      "UPDATE todos SET title = ?, start_date = ?, end_date = ?, description = ?, completed = ? WHERE id = ? AND user_id = ?",
      [
        title,
        start_date,
        end_date,
        description,
        completed,
        req.params.id,
        req.user.userId,
      ]
    );

    const [updatedTodo] = await db.execute(
      "SELECT * FROM todos WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.userId]
    );

    res.json(updatedTodo[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/todos/:id", authenticateToken, async (req, res) => {
  try {
    await db.execute("DELETE FROM todos WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.user.userId,
    ]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 간트차트 API ====================
app.get("/api/gantt", authenticateToken, async (req, res) => {
  try {
    const [todos] = await db.execute(
      "SELECT id, title, start_date, end_date, completed FROM todos WHERE user_id = ? AND start_date IS NOT NULL AND end_date IS NOT NULL ORDER BY start_date ASC",
      [req.user.userId]
    );
    res.json(todos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 채팅방 API ====================
app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const [rooms] = await db.execute(
      "SELECT * FROM chat_rooms ORDER BY created_at DESC"
    );
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const [result] = await db.execute(
      "INSERT INTO chat_rooms (name, description, created_by) VALUES (?, ?, ?)",
      [name, description || null, req.user.userId]
    );

    const [newRoom] = await db.execute(
      "SELECT * FROM chat_rooms WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json(newRoom[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/chat/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    try {
      const [messages] = await db.execute(
        `SELECT cm.*, u.nickname as user_nickname 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.room_id = ? 
       ORDER BY cm.created_at ASC`,
        [req.params.roomId]
      );
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== Socket.IO 채팅 ====================
io.on("connection", (socket) => {
  console.log("사용자 연결:", socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    socket.emit("joined_room", roomId);
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
  });

  socket.on("send_message", async (data) => {
    try {
      const { roomId, message, userId, userNickname } = data; // 메시지 DB 저장

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
      }; // 같은 방에 있는 모든 사용자에게 메시지 전송

      io.to(roomId).emit("receive_message", newMessage);
    } catch (error) {
      socket.emit("error", { message: "메시지 전송 실패" });
    }
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 해제:", socket.id);
  });
});

// 헬스체크
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// API 포트와 Socket 포트를 다르게 실행
const API_PORT = process.env.API_PORT || 4000;
const SOCKET_PORT = process.env.SOCKET_PORT || 5000;

// API 서버 (포트 4000)
app.listen(API_PORT, () => {
  console.log(`API 서버 실행중: http://localhost:${API_PORT}`);
});

// Socket.IO 서버 (포트 5000)
server.listen(SOCKET_PORT, () => {
  console.log(`Socket.IO 서버 실행중: http://localhost:${SOCKET_PORT}`);
});
