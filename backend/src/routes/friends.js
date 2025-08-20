// src/routes/friends.js - 친구 라우터
const express = require("express");
const { prisma } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// 친구 요청 생성
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.body;
    const currentUserId = req.user.userId;

    if (!user_id || user_id === currentUserId) {
      return res.status(400).json({ error: "유효하지 않은 사용자 ID입니다" });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: user_id } });
    if (!targetUser) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    }

    const existingFriend = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: currentUserId, friendId: user_id },
          { userId: user_id, friendId: currentUserId },
        ],
      },
    });

    if (existingFriend) {
      return res
        .status(400)
        .json({ error: "이미 친구 관계이거나 요청이 존재합니다" });
    }

    const friend = await prisma.friend.create({
      data: { userId: currentUserId, friendId: user_id },
      include: {
        friend: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
    });

    res.status(201).json(friend);
  } catch (error) {
    console.error("친구 요청 생성 오류:", error);
    res.status(500).json({ error: "친구 요청 생성에 실패했습니다" });
  }
});

// 친구 목록 조회
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user.userId;

    const whereClause = {
      OR: [{ userId }, { friendId: userId }],
    };
    if (status) whereClause.status = status;

    const friends = await prisma.friend.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true, lastLogin: true },
        },
        friend: {
          select: { id: true, nickname: true, avatar: true, lastLogin: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = friends.map((friendship) => {
      const isInitiator = friendship.userId === userId;
      return {
        id: friendship.id,
        user: isInitiator ? friendship.friend : friendship.user,
        status: friendship.status,
        isInitiator,
        createdAt: friendship.createdAt,
        updatedAt: friendship.updatedAt,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("친구 목록 조회 오류:", error);
    res.status(500).json({ error: "친구 목록 조회에 실패했습니다" });
  }
});

// 친구 관계 상태 변경 (수락/거절/차단)
router.patch("/:friend_id", authenticateToken, async (req, res) => {
  try {
    const { friend_id } = req.params;
    const { relation } = req.body;
    const userId = req.user.userId;

    if (!["accepted", "blocked"].includes(relation)) {
      return res.status(400).json({ error: "유효하지 않은 관계 상태입니다" });
    }

    const friendship = await prisma.friend.findFirst({
      where: {
        id: friend_id,
        OR: [{ userId }, { friendId: userId }],
      },
    });

    if (!friendship) {
      return res.status(404).json({ error: "친구 관계를 찾을 수 없습니다" });
    }

    // 요청을 받은 사람만 수락/거절할 수 있음
    if (friendship.friendId !== userId && relation === "accepted") {
      return res
        .status(403)
        .json({ error: "친구 요청을 받은 사람만 수락할 수 있습니다" });
    }

    const updatedFriendship = await prisma.friend.update({
      where: { id: friend_id },
      data: { status: relation },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        friend: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    res.json(updatedFriendship);
  } catch (error) {
    console.error("친구 관계 상태 변경 오류:", error);
    res.status(500).json({ error: "친구 관계 상태 변경에 실패했습니다" });
  }
});

// 친구 관계 삭제
router.delete("/:friend_id", authenticateToken, async (req, res) => {
  try {
    const { friend_id } = req.params;
    const userId = req.user.userId;

    const friendship = await prisma.friend.findFirst({
      where: {
        id: friend_id,
        OR: [{ userId }, { friendId: userId }],
      },
    });

    if (!friendship) {
      return res.status(404).json({ error: "친구 관계를 찾을 수 없습니다" });
    }

    await prisma.friend.delete({ where: { id: friend_id } });
    res.status(204).send();
  } catch (error) {
    console.error("친구 관계 삭제 오류:", error);
    res.status(500).json({ error: "친구 관계 삭제에 실패했습니다" });
  }
});

// 받은 친구 요청 목록
router.get("/requests/received", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const requests = await prisma.friend.findMany({
      where: {
        friendId: userId,
        status: "pending",
      },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(requests);
  } catch (error) {
    console.error("받은 친구 요청 조회 오류:", error);
    res.status(500).json({ error: "친구 요청 조회에 실패했습니다" });
  }
});

// 보낸 친구 요청 목록
router.get("/requests/sent", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const requests = await prisma.friend.findMany({
      where: {
        userId: userId,
        status: "pending",
      },
      include: {
        friend: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(requests);
  } catch (error) {
    console.error("보낸 친구 요청 조회 오류:", error);
    res.status(500).json({ error: "친구 요청 조회에 실패했습니다" });
  }
});

module.exports = router;
