// src/routes/auth.js - 수정된 인증 라우터
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); // JWT 검증을 위해 추가
const { prisma } = require("../config/database");
const { generateTokens, authenticateToken } = require("../middleware/auth");

const router = express.Router();

// 회원가입
router.post("/signup", async (req, res) => {
  try {
    console.log("회원가입 요청:", req.body); // 디버그 로그

    const { email, password, nickname } = req.body;

    // 입력 검증
    if (!email || !password || !nickname) {
      console.log("입력 데이터 부족"); // 디버그 로그
      return res.status(400).json({
        error: "이메일, 비밀번호, 닉네임은 필수입니다",
        received: {
          email: !!email,
          password: !!password,
          nickname: !!nickname,
        },
      });
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "유효하지 않은 이메일 형식입니다" });
    }

    // 비밀번호 길이 검증
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "비밀번호는 최소 6자 이상이어야 합니다" });
    }

    console.log("이메일 중복 확인 중..."); // 디버그 로그

    // 이메일 중복 확인
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log("이메일 중복:", email); // 디버그 로그
      return res.status(409).json({ error: "이미 존재하는 이메일입니다" }); // 409 Conflict
    }

    console.log("비밀번호 해시화 중..."); // 디버그 로그

    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("사용자 생성 중..."); // 디버그 로그

    // 사용자 생성
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        createdAt: true,
      },
    });

    console.log("사용자 생성 완료:", user.id); // 디버그 로그

    // 토큰 생성
    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role
    );

    console.log("토큰 생성 완료"); // 디버그 로그

    // 리프레시 토큰 저장
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일
      },
    });

    console.log("회원가입 성공:", user.email); // 디버그 로그

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("회원가입 오류 상세:", error); // 상세한 에러 로그
    console.error("Error stack:", error.stack); // 스택 트레이스

    // Prisma 관련 에러 처리
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "이미 존재하는 이메일입니다",
        detail: "Database unique constraint violation",
      });
    }

    // bcrypt 에러 처리
    if (error.message && error.message.includes("bcrypt")) {
      return res.status(500).json({
        error: "비밀번호 암호화 중 오류가 발생했습니다",
        detail:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // 일반적인 서버 에러
    res.status(500).json({
      error: "서버 오류가 발생했습니다",
      detail:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
});

// 로그인
router.post("/login", async (req, res) => {
  try {
    console.log("로그인 요청:", { email: req.body.email }); // 비밀번호는 로그에서 제외

    const { email, password } = req.body;

    // 입력 검증
    if (!email || !password) {
      return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다" });
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    // 마지막 로그인 시간 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // 토큰 생성
    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role
    );

    // 기존 리프레시 토큰 삭제 후 새로 생성
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    console.log("로그인 성공:", user.email);

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
    res.status(500).json({
      error: "서버 오류가 발생했습니다",
      detail:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// 토큰 갱신 - 수정된 부분
router.post("/refresh", async (req, res) => {
  try {
    console.log("토큰 갱신 요청"); // 디버그 로그

    const { refreshToken: refresh } = req.body; // refreshToken 또는 refresh 둘 다 지원
    const refreshTokenToUse = refresh || req.body.refresh;

    if (!refreshTokenToUse) {
      console.log("리프레시 토큰 누락");
      return res.status(401).json({ error: "리프레시 토큰이 필요합니다" });
    }

    console.log("데이터베이스에서 토큰 조회 중...");

    // 데이터베이스에서 리프레시 토큰 조회
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenToUse },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            nickname: true,
            role: true,
            isActive: true,
            avatar: true,
          },
        },
      },
    });

    if (!storedToken) {
      console.log("토큰이 데이터베이스에 없음");
      return res
        .status(401)
        .json({ error: "유효하지 않은 리프레시 토큰입니다" });
    }

    // 토큰 만료 확인
    if (storedToken.expiresAt < new Date()) {
      console.log("토큰 만료됨");
      // 만료된 토큰 삭제
      await prisma.refreshToken.delete({
        where: { token: refreshTokenToUse },
      });
      return res.status(401).json({ error: "리프레시 토큰이 만료되었습니다" });
    }

    // 사용자 활성 상태 확인
    if (!storedToken.user.isActive) {
      console.log("비활성 사용자");
      return res.status(401).json({ error: "비활성화된 사용자입니다" });
    }

    console.log("JWT 토큰 검증 중...");

    // JWT 자체의 유효성도 검증 (선택적, 하지만 보안상 권장)
    try {
      jwt.verify(refreshTokenToUse, process.env.REFRESH_TOKEN_SECRET);
    } catch (jwtError) {
      console.log("JWT 검증 실패:", jwtError.message);
      // 유효하지 않은 JWT는 삭제
      await prisma.refreshToken.delete({
        where: { token: refreshTokenToUse },
      });
      return res
        .status(401)
        .json({ error: "유효하지 않은 리프레시 토큰입니다" });
    }

    console.log("새 액세스 토큰 생성 중...");

    // 새로운 액세스 토큰 생성
    const { accessToken } = generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role
    );

    console.log("토큰 갱신 성공:", storedToken.user.email);

    res.json({
      accessToken,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        nickname: storedToken.user.nickname,
        role: storedToken.user.role,
        avatar: storedToken.user.avatar,
      },
    });
  } catch (error) {
    console.error("토큰 갱신 오류 상세:", error);
    console.error("Error stack:", error.stack);

    res.status(401).json({
      error: "토큰 갱신 중 오류가 발생했습니다",
      detail:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// 로그아웃
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    console.log("로그아웃 요청:", req.user.userId);

    // 해당 사용자의 모든 리프레시 토큰 삭제
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: { userId: req.user.userId },
    });

    console.log("삭제된 토큰 수:", deletedTokens.count);
    console.log("로그아웃 성공:", req.user.userId);

    res.status(204).send();
  } catch (error) {
    console.error("로그아웃 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
