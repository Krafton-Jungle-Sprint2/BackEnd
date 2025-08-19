// my-backend/src/socket.js
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function initializeSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("인증 오류: 토큰이 제공되지 않았습니다."));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error("인증 오류: 유효하지 않은 토큰입니다."));
      }
      socket.user = decoded;
      next();
    });
  });

  io.on("connection", (socket) => {
    console.log(
      `💬 Socket 연결: ${socket.id} (사용자 ID: ${socket.user.id}, 닉네임: ${socket.user.nickname})`
    );

    socket.on("join_room", (roomId) => {
      if (!roomId) return;
      socket.join(roomId);
      socket.emit("joined_room", roomId);
      console.log(`방 ${roomId} 입장: ${socket.id}`);
    });

    socket.on("send_message", async (data) => {
      try {
        const userId = socket.user.user.id;
        const { roomId, message } = data;

        if (!roomId || !message || message.trim() === "") {
          return socket.emit("error", {
            message: "방 ID와 메시지 내용은 필수입니다.",
          });
        }

        const newMessage = await prisma.chatMessage.create({
          data: {
            text: message,
            roomId,
            userId: userId,
          },
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatar: true,
              },
            },
          },
        });

        io.to(roomId).emit("receive_message", newMessage);
      } catch (error) {
        console.error("메시지 전송 오류:", error);
        socket.emit("error", {
          message: "서버 오류로 메시지 전송에 실패했습니다.",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`👋 Socket 연결 해제: ${socket.id}`);
    });
  });

  return io;
}

module.exports = { initializeSocket };
