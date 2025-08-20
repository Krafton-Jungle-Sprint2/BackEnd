// src/socket.js - Socket.IO 로직 분리
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function initializeSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  // Socket.IO 인증 미들웨어
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("인증 오류: 토큰이 제공되지 않았습니다."));
    }

    jwt.verify(
      token,
      process.env.JWT_SECRET || "secret_key",
      (err, decoded) => {
        if (err) {
          return next(new Error("인증 오류: 유효하지 않은 토큰입니다."));
        }
        socket.user = decoded;
        next();
      }
    );
  });

  io.on("connection", (socket) => {
    console.log(
      `💬 Socket 연결: ${socket.id} (사용자 ID: ${socket.user.userId}, 이메일: ${socket.user.email})`
    );

    // 워크스페이스 입장
    socket.on("join_workspace", async (wsId) => {
      try {
        if (!wsId) return;

        // 워크스페이스 멤버십 확인
        const isMember = await checkWorkspaceMembership(
          socket.user.userId,
          wsId
        );

        if (!isMember) {
          return socket.emit("error", {
            message: "워크스페이스에 접근 권한이 없습니다.",
          });
        }

        socket.join(`workspace_${wsId}`);
        socket.emit("joined_workspace", wsId);
        console.log(`워크스페이스 ${wsId} 입장: ${socket.id}`);

        // 워크스페이스 내 다른 사용자들에게 알림
        socket.to(`workspace_${wsId}`).emit("user_joined", {
          userId: socket.user.userId,
          email: socket.user.email,
        });
      } catch (error) {
        console.error("워크스페이스 입장 오류:", error);
        socket.emit("error", {
          message: "워크스페이스 입장에 실패했습니다.",
        });
      }
    });

    // 워크스페이스 퇴장
    socket.on("leave_workspace", (wsId) => {
      if (!wsId) return;

      socket.leave(`workspace_${wsId}`);
      socket.emit("left_workspace", wsId);
      console.log(`워크스페이스 ${wsId} 퇴장: ${socket.id}`);

      // 워크스페이스 내 다른 사용자들에게 알림
      socket.to(`workspace_${wsId}`).emit("user_left", {
        userId: socket.user.userId,
        email: socket.user.email,
      });
    });

    // Task 업데이트 알림
    socket.on("task_update", async (data) => {
      try {
        const { wsId, taskId, action, taskData } = data;
        const userId = socket.user.userId;

        if (!wsId || !taskId) {
          return socket.emit("error", {
            message: "워크스페이스 ID와 Task ID는 필수입니다.",
          });
        }

        // 워크스페이스 멤버십 확인
        const isMember = await checkWorkspaceMembership(userId, wsId);

        if (!isMember) {
          return socket.emit("error", {
            message: "워크스페이스에 접근 권한이 없습니다.",
          });
        }

        // Task 존재 확인
        const task = await prisma.groupTask.findFirst({
          where: {
            id: taskId,
            workspaceId: wsId,
          },
        });

        if (!task) {
          return socket.emit("error", {
            message: "Task를 찾을 수 없습니다.",
          });
        }

        // 워크스페이스의 모든 사용자에게 알림
        io.to(`workspace_${wsId}`).emit("task_updated", {
          taskId,
          action: action || "updated", // created, updated, deleted
          userId,
          taskData: taskData || task,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `Task 업데이트 알림 전송 - WS: ${wsId}, Task: ${taskId}, Action: ${action}`
        );
      } catch (error) {
        console.error("Task 업데이트 알림 오류:", error);
        socket.emit("error", {
          message: "Task 업데이트 알림 전송에 실패했습니다.",
        });
      }
    });

    // 개인 Todo 업데이트 알림 (친구들에게)
    socket.on("todo_update", async (data) => {
      try {
        const { todoId, action, todoData } = data;
        const userId = socket.user.userId;

        if (!todoId) {
          return socket.emit("error", {
            message: "Todo ID는 필수입니다.",
          });
        }

        // 친구 목록 조회
        const friends = await prisma.friend.findMany({
          where: {
            OR: [
              { userId: userId, status: "accepted" },
              { friendId: userId, status: "accepted" },
            ],
          },
          include: {
            user: true,
            friend: true,
          },
        });

        // 친구들에게 알림 전송
        friends.forEach((friendship) => {
          const friendId =
            friendship.userId === userId
              ? friendship.friendId
              : friendship.userId;

          io.to(`user_${friendId}`).emit("friend_todo_updated", {
            todoId,
            action: action || "updated",
            userId,
            todoData,
            timestamp: new Date().toISOString(),
          });
        });

        console.log(
          `개인 Todo 업데이트 알림 전송 - Todo: ${todoId}, Action: ${action}`
        );
      } catch (error) {
        console.error("개인 Todo 업데이트 알림 오류:", error);
        socket.emit("error", {
          message: "Todo 업데이트 알림 전송에 실패했습니다.",
        });
      }
    });

    // 친구 요청 알림
    socket.on("friend_request", async (data) => {
      try {
        const { targetUserId, action } = data;
        const userId = socket.user.userId;

        if (!targetUserId) {
          return socket.emit("error", {
            message: "대상 사용자 ID는 필수입니다.",
          });
        }

        // 대상 사용자에게 알림
        io.to(`user_${targetUserId}`).emit("friend_request_received", {
          fromUserId: userId,
          fromUserEmail: socket.user.email,
          action: action || "sent",
          timestamp: new Date().toISOString(),
        });

        console.log(
          `친구 요청 알림 전송 - From: ${userId}, To: ${targetUserId}`
        );
      } catch (error) {
        console.error("친구 요청 알림 오류:", error);
        socket.emit("error", {
          message: "친구 요청 알림 전송에 실패했습니다.",
        });
      }
    });

    // 사용자별 개인 채널 입장
    socket.on("join_personal_channel", () => {
      const userId = socket.user.userId;
      socket.join(`user_${userId}`);
      socket.emit("joined_personal_channel", userId);
      console.log(`개인 채널 입장 - User: ${userId}, Socket: ${socket.id}`);
    });

    // 실시간 타이핑 표시 (워크스페이스용)
    socket.on("typing_start", (data) => {
      const { wsId } = data;
      if (wsId) {
        socket.to(`workspace_${wsId}`).emit("user_typing", {
          userId: socket.user.userId,
          email: socket.user.email,
          isTyping: true,
        });
      }
    });

    socket.on("typing_stop", (data) => {
      const { wsId } = data;
      if (wsId) {
        socket.to(`workspace_${wsId}`).emit("user_typing", {
          userId: socket.user.userId,
          email: socket.user.email,
          isTyping: false,
        });
      }
    });

    // 연결 해제 처리
    socket.on("disconnect", () => {
      console.log(
        `👋 Socket 연결 해제: ${socket.id} (사용자: ${socket.user.email})`
      );

      // 모든 워크스페이스에 사용자 오프라인 알림
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        if (room.startsWith("workspace_")) {
          socket.to(room).emit("user_offline", {
            userId: socket.user.userId,
            email: socket.user.email,
          });
        }
      });
    });
  });

  return io;
}

// 워크스페이스 멤버십 확인 함수
async function checkWorkspaceMembership(userId, wsId) {
  try {
    // 소유자인지 확인
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: wsId,
        ownerId: userId,
      },
    });

    if (workspace) {
      return true;
    }

    // 멤버인지 확인
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: wsId,
        userId: userId,
        accepted: true,
      },
    });

    return !!member;
  } catch (error) {
    console.error("워크스페이스 멤버십 확인 오류:", error);
    return false;
  }
}

module.exports = { initializeSocket };
