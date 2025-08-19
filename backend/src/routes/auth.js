// src/routes/auth.js - 인증 라우터
const express = require("express");
const bcrypt = require("bcrypt");
const { prisma } = require("../config/database");
const { generateTokens, authenticateToken } = require("../middleware/auth");

const router = express.Router();

// 회원가입
router.post("/signup", async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email || !password || !nickname) {
      return res
        .status(400)
        .json({ error: "이메일, 비밀번호, 닉네임은 필수입니다" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "이미 존재하는 이메일입니다" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, nickname },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        createdAt: true,
      },
    });

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role
    );

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

// 로그인
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role
    );

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

// 토큰 갱신
router.post("/refresh", async (req, res) => {
  try {
    const { refresh } = req.body;
    if (!refresh) {
      return res.status(401).json({ error: "리프레시 토큰이 필요합니다" });
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refresh },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res
        .status(401)
        .json({ error: "유효하지 않은 리프레시 토큰입니다" });
    }

    const { accessToken } = generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role
    );

    res.json({ accessToken });
  } catch (error) {
    console.error("토큰 갱신 오류:", error);
    res.status(401).json({ error: "유효하지 않은 리프레시 토큰입니다" });
  }
});

// 로그아웃
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.userId },
    });
    res.status(204).send();
  } catch (error) {
    console.error("로그아웃 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
