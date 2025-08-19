// src/routes/users.js - 사용자 라우터
const express = require("express");
const bcrypt = require("bcrypt");
const { prisma } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// 내 정보 조회
router.get("/me", authenticateToken, async (req, res) => {
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

// 내 정보 수정
router.patch("/me", authenticateToken, async (req, res) => {
  try {
    const { nickname, password, avatar } = req.body;
    const updateData = {};

    if (nickname) updateData.nickname = nickname;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (password) updateData.password = await bcrypt.hash(password, 10);

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

// 사용자 검색 (친구 추가용)
router.get("/search", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res
        .status(400)
        .json({ error: "검색어는 최소 2자 이상이어야 합니다" });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.userId } }, // 자기 자신 제외
          { isActive: true },
          {
            OR: [{ email: { contains: q } }, { nickname: { contains: q } }],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
      },
      take: 10, // 최대 10명
    });

    res.json(users);
  } catch (error) {
    console.error("사용자 검색 오류:", error);
    res.status(500).json({ error: "사용자 검색에 실패했습니다" });
  }
});

// 사용자 상세 정보 조회 (공개 정보만)
router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        // 개인정보는 제외
      },
    });

    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    }

    // 친구 관계 확인
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: req.user.userId, friendId: userId },
          { userId: userId, friendId: req.user.userId },
        ],
      },
    });

    res.json({
      ...user,
      friendshipStatus: friendship ? friendship.status : null,
      isFriend: friendship?.status === "accepted" || false,
    });
  } catch (error) {
    console.error("사용자 조회 오류:", error);
    res.status(500).json({ error: "사용자 조회에 실패했습니다" });
  }
});

module.exports = router;
