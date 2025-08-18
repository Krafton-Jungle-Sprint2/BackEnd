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
  try {
    const { email, password, nickname } = req.body;

    // 이메일 중복 확인
    const [existingUser] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ error: "이미 존재하는 이메일입니다" });
    }

    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(password, 10);

    // 사용자 생성
    const [result] = await db.execute(
      "INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)",
      [email, hashedPassword, nickname]
    );

    res.status(201).json({
      message: "회원가입 성공",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 사용자 조회
    const [users] = await db.execute(
      "SELECT id, email, password, nickname FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    const user = users[0];

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "24h" }
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
    console.error("로그인 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

app.get("/api/todos", authenticateToken, async (req, res) => {
  try {
    const [todos] = await db.execute(
      "SELECT id, title, description, start_date, end_date, status, created_at FROM todos WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.userId]
    );

    res.json(todos);
  } catch (error) {
    console.error("ToDo 조회 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ToDo 생성
app.post("/api/todos", authenticateToken, async (req, res) => {
  try {
    const { title, description, startDate, endDate } = req.body;

    const [result] = await db.execute(
      "INSERT INTO todos (user_id, title, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [req.user.userId, title, description || null, startDate, endDate]
    );

    // 생성된 ToDo 조회해서 반환
    const [newTodo] = await db.execute(
      "SELECT id, title, description, start_date, end_date, status, created_at FROM todos WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json(newTodo[0]);
  } catch (error) {
    console.error("ToDo 생성 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ToDo 수정
app.put("/api/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, startDate, endDate, status } = req.body;

    // 해당 ToDo가 현재 사용자의 것인지 확인
    const [existingTodo] = await db.execute(
      "SELECT id FROM todos WHERE id = ? AND user_id = ?",
      [id, req.user.userId]
    );

    if (existingTodo.length === 0) {
      return res.status(404).json({ error: "ToDo를 찾을 수 없습니다" });
    }

    // ToDo 업데이트
    await db.execute(
      "UPDATE todos SET title = ?, description = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?",
      [title, description, startDate, endDate, status, id]
    );

    // 업데이트된 ToDo 조회해서 반환
    const [updatedTodo] = await db.execute(
      "SELECT id, title, description, start_date, end_date, status, created_at FROM todos WHERE id = ?",
      [id]
    );

    res.json(updatedTodo[0]);
  } catch (error) {
    console.error("ToDo 수정 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ToDo 삭제
app.delete("/api/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 해당 ToDo가 현재 사용자의 것인지 확인
    const [existingTodo] = await db.execute(
      "SELECT id FROM todos WHERE id = ? AND user_id = ?",
      [id, req.user.userId]
    );

    if (existingTodo.length === 0) {
      return res.status(404).json({ error: "ToDo를 찾을 수 없습니다" });
    }

    // ToDo 삭제
    await db.execute("DELETE FROM todos WHERE id = ?", [id]);

    res.json({ message: "ToDo가 삭제되었습니다" });
  } catch (error) {
    console.error("ToDo 삭제 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// 간트차트 데이터 조회
app.get("/api/gantt", authenticateToken, async (req, res) => {
  try {
    const [todos] = await db.execute(
      "SELECT id, title, start_date, end_date, status FROM todos WHERE user_id = ? AND start_date IS NOT NULL AND end_date IS NOT NULL ORDER BY start_date",
      [req.user.userId]
    );

    // 간트차트 형식으로 데이터 변환
    const ganttData = todos.map((todo) => ({
      id: todo.id,
      name: todo.title,
      start: todo.start_date,
      end: todo.end_date,
      status: todo.status,
      duration: Math.ceil(
        (new Date(todo.end_date) - new Date(todo.start_date)) /
          (1000 * 60 * 60 * 24)
      ), // 일수 계산
    }));

    res.json(ganttData);
  } catch (error) {
    console.error("간트차트 데이터 조회 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// 채팅방 목록 조회
app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const [rooms] = await db.execute(
      "SELECT id, name, description, created_at FROM chat_rooms ORDER BY created_at DESC"
    );

    res.json(rooms);
  } catch (error) {
    console.error("채팅방 목록 조회 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// 채팅방 생성
app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const [result] = await db.execute(
      "INSERT INTO chat_rooms (name, description, created_by) VALUES (?, ?, ?)",
      [name, description || null, req.user.userId]
    );

    // 생성된 채팅방 조회해서 반환
    const [newRoom] = await db.execute(
      "SELECT id, name, description, created_at FROM chat_rooms WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json(newRoom[0]);
  } catch (error) {
    console.error("채팅방 생성 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// 특정 채팅방의 메시지 조회
app.get(
  "/api/chat/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    try {
      const { roomId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const [messages] = await db.execute(
        `SELECT cm.id, cm.message, cm.created_at, cm.user_id, u.nickname as user_nickname 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.room_id = ? 
       ORDER BY cm.created_at DESC 
       LIMIT ? OFFSET ?`,
        [roomId, limit, offset]
      );

      // 최신 순으로 정렬 (화면 표시용)
      res.json(messages.reverse());
    } catch (error) {
      console.error("채팅 메시지 조회 오류:", error);
      res.status(500).json({ error: "서버 오류" });
    }
  }
);

// 사용자 프로필 조회
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const [users] = await db.execute(
      "SELECT id, email, nickname, created_at FROM users WHERE id = ?",
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    }

    res.json(users[0]);
  } catch (error) {
    console.error("프로필 조회 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// 사용자 프로필 수정
app.put("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const { nickname } = req.body;

    await db.execute("UPDATE users SET nickname = ? WHERE id = ?", [
      nickname,
      req.user.userId,
    ]);

    // 업데이트된 사용자 정보 조회
    const [updatedUser] = await db.execute(
      "SELECT id, email, nickname, created_at FROM users WHERE id = ?",
      [req.user.userId]
    );

    res.json(updatedUser[0]);
  } catch (error) {
    console.error("프로필 수정 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ToDo 상태별 통계 조회
app.get("/api/todos/stats", authenticateToken, async (req, res) => {
  try {
    const [stats] = await db.execute(
      `SELECT 
        status,
        COUNT(*) as count
       FROM todos 
       WHERE user_id = ? 
       GROUP BY status`,
      [req.user.userId]
    );

    // 기본 상태값들로 초기화
    const result = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      total: 0,
    };

    // 통계 데이터 적용
    stats.forEach((stat) => {
      result[stat.status] = stat.count;
      result.total += stat.count;
    });

    res.json(result);
  } catch (error) {
    console.error("ToDo 통계 조회 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

// 팀원 목록 조회 (간단 버전)
app.get("/api/team/members", authenticateToken, async (req, res) => {
  try {
    // 모든 사용자를 팀원으로 간주 (MVP 버전)
    const [members] = await db.execute(
      "SELECT id, email, nickname, created_at FROM users ORDER BY nickname"
    );

    res.json(members);
  } catch (error) {
    console.error("팀원 조회 오류:", error);
    res.status(500).json({ error: "서버 오류" });
  }
});

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
