// src/middleware/auth.js - 인증 미들웨어
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// JWT 토큰 생성 함수
const generateTokens = (userId, email, role) => {
  const accessToken = jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );

  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  });

  return { accessToken, refreshToken };
};

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "인증 토큰이 필요합니다" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "유효하지 않은 토큰입니다" });
    }
    req.user = user;
    next();
  });
};

// 워크스페이스 멤버 확인 미들웨어
const checkWorkspaceMember = async (req, res, next) => {
  try {
    const { wsId } = req.params;
    const userId = req.user.userId;

    // 소유자인지 확인
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: wsId,
        ownerId: userId,
      },
    });

    if (workspace) {
      req.isOwner = true;
      return next();
    }

    // 멤버인지 확인
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: wsId,
        userId: userId,
        accepted: true,
      },
    });

    if (!member) {
      return res
        .status(403)
        .json({ error: "워크스페이스에 접근 권한이 없습니다" });
    }

    req.isOwner = false;
    next();
  } catch (error) {
    console.error("워크스페이스 멤버 확인 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
};

// 워크스페이스 소유자 확인 미들웨어
const checkWorkspaceOwner = async (req, res, next) => {
  try {
    const { wsId } = req.params;
    const userId = req.user.userId;

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: wsId,
        ownerId: userId,
      },
    });

    if (!workspace) {
      return res
        .status(403)
        .json({ error: "워크스페이스 소유자만 접근할 수 있습니다" });
    }

    next();
  } catch (error) {
    console.error("워크스페이스 소유자 확인 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
};

// 관리자 권한 확인 미들웨어
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "관리자 권한이 필요합니다" });
  }
  next();
};

// 본인 확인 미들웨어 (사용자가 자신의 데이터에만 접근)
const requireSelf = (req, res, next) => {
  const { userId } = req.params;

  if (userId && userId !== req.user.userId) {
    return res
      .status(403)
      .json({ error: "본인의 데이터에만 접근할 수 있습니다" });
  }

  next();
};

module.exports = {
  generateTokens,
  authenticateToken,
  checkWorkspaceMember,
  checkWorkspaceOwner,
  requireAdmin,
  requireSelf,
};
