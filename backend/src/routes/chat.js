const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// 채팅방 목록 조회
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
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

    res.json({ rooms });
  } catch (error) {
    console.error("채팅방 목록 조회 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 채팅방 생성
router.post("/rooms", async (req, res) => {
  try {
    const { name, description, isPrivate = false } = req.body;

    if (!name) {
      return res.status(400).json({ error: "채팅방 이름을 입력해주세요." });
    }

    const room = await prisma.chatRoom.create({
      data: {
        name,
        description,
        isPrivate,
      },
    });

    res.status(201).json({
      message: "채팅방이 생성되었습니다.",
      room,
    });
  } catch (error) {
    console.error("채팅방 생성 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 채팅방 상세 정보 조회
router.get("/rooms/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없습니다." });
    }

    res.json({ room });
  } catch (error) {
    console.error("채팅방 상세 조회 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 채팅방 메시지 조회
router.get("/rooms/:roomId/messages", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    // 채팅방 존재 확인
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없습니다." });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    // 시간순으로 다시 정렬 (최신이 아래)
    messages.reverse();

    const totalCount = await prisma.chatMessage.count({
      where: { roomId },
    });

    res.json({
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("채팅 메시지 조회 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 메시지 생성 (REST API용 - Socket.IO가 주로 사용됨)
router.post("/rooms/:roomId/messages", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "메시지 내용을 입력해주세요." });
    }

    // 채팅방 존재 확인
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없습니다." });
    }

    const message = await prisma.chatMessage.create({
      data: {
        content: content.trim(),
        userId: req.user.userId,
        roomId,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    // 채팅방 업데이트 시간 갱신
    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({
      message: "메시지가 전송되었습니다.",
      data: message,
    });
  } catch (error) {
    console.error("메시지 생성 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 채팅방 수정
router.put("/rooms/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, description, isPrivate } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

    const room = await prisma.chatRoom.update({
      where: { id: roomId },
      data: updateData,
    });

    res.json({
      message: "채팅방이 수정되었습니다.",
      room,
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없습니다." });
    }
    console.error("채팅방 수정 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 채팅방 삭제
router.delete("/rooms/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;

    await prisma.chatRoom.delete({
      where: { id: roomId },
    });

    res.json({ message: "채팅방이 삭제되었습니다." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없습니다." });
    }
    console.error("채팅방 삭제 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

module.exports = router;
