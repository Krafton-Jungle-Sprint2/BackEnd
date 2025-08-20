// src/middleware/auth.js - 인증 미들웨어 강화
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { config } = require("../config/env");

const prisma = new PrismaClient();

/**
 * 액세스 토큰과 리프레시 토큰을 생성합니다.
 * 환경 변수 검증 후 안전하게 토큰을 생성합니다.
 */
const generateTokens = (userId, email, role) => {
  try {
    // 환경 변수 검증
    if (!config.jwt.secret || !config.jwt.refreshSecret) {
      throw new Error('JWT 시크릿 키가 설정되지 않았습니다.');
    }

    // 액세스 토큰 생성
    const accessToken = jwt.sign(
      { 
        userId, 
        email, 
        role, 
        type: "access",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15분
      },
      config.jwt.secret,
      { 
        expiresIn: config.jwt.accessTokenExpiry,
        algorithm: 'HS256'
      }
    );

    // 리프레시 토큰 생성
    const refreshToken = jwt.sign(
      { 
        userId, 
        email, 
        role, 
        type: "refresh",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7일
      },
      config.jwt.refreshSecret,
      { 
        expiresIn: config.jwt.refreshTokenExpiry,
        algorithm: 'HS256'
      }
    );

    return { accessToken, refreshToken };
  } catch (error) {
    console.error('토큰 생성 오류:', error);
    throw new Error(`토큰 생성 실패: ${error.message}`);
  }
};

/**
 * JWT 인증 미들웨어
 * 토큰 만료 오류를 명확하게 구분하여 처리하도록 개선했습니다.
 */
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: "인증 토큰이 필요합니다",
        code: "MISSING_TOKEN"
      });
    }

    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: "토큰 형식이 올바르지 않습니다",
        code: "INVALID_TOKEN_FORMAT"
      });
    }

    // JWT 시크릿 검증
    if (!config.jwt.secret) {
      console.error('JWT_SECRET이 설정되지 않았습니다.');
      return res.status(500).json({ 
        error: "서버 설정 오류",
        code: "SERVER_CONFIG_ERROR"
      });
    }

    // 액세스 토큰은 JWT_SECRET으로 검증합니다.
    jwt.verify(token, config.jwt.secret, (err, user) => {
      if (err) {
        if (err instanceof jwt.TokenExpiredError) {
          return res.status(401).json({ 
            error: "토큰이 만료되었습니다",
            code: "TOKEN_EXPIRED"
          });
        }
        
        if (err instanceof jwt.JsonWebTokenError) {
          return res.status(403).json({ 
            error: "유효하지 않은 토큰입니다",
            code: "INVALID_TOKEN"
          });
        }
        
        return res.status(403).json({ 
          error: "토큰 검증 실패",
          code: "TOKEN_VERIFICATION_FAILED"
        });
      }
      
      // 토큰 타입 검증
      if (user.type !== 'access') {
        return res.status(403).json({ 
          error: "잘못된 토큰 타입입니다",
          code: "INVALID_TOKEN_TYPE"
        });
      }
      
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('인증 미들웨어 오류:', error);
    return res.status(500).json({ 
      error: "인증 처리 중 오류가 발생했습니다",
      code: "AUTHENTICATION_ERROR"
    });
  }
};

// 워크스페이스 멤버 확인 미들웨어
const checkWorkspaceMember = async (req, res, next) => {
  try {
    const { wsId } = req.params;
    const userId = req.user.userId;
    
    if (!wsId) {
      return res.status(400).json({ 
        error: "워크스페이스 ID가 필요합니다",
        code: "MISSING_WORKSPACE_ID"
      });
    }

    // 소유자 확인
    const workspace = await prisma.workspace.findFirst({
      where: { id: wsId, ownerId: userId },
    });
    
    if (workspace) {
      req.isOwner = true;
      return next();
    }
    
    // 멤버 확인
    const member = await prisma.workspaceMember.findFirst({
      where: { 
        workspaceId: wsId, 
        userId: userId, 
        accepted: true 
      },
    });
    
    if (!member) {
      return res.status(403).json({ 
        error: "워크스페이스에 접근 권한이 없습니다",
        code: "ACCESS_DENIED"
      });
    }
    
    req.isOwner = false;
    next();
  } catch (error) {
    console.error("워크스페이스 멤버 확인 오류:", error);
    
    // Prisma 관련 에러 처리
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: "워크스페이스를 찾을 수 없습니다",
        code: "WORKSPACE_NOT_FOUND"
      });
    }
    
    res.status(500).json({ 
      error: "서버 오류가 발생했습니다",
      code: "SERVER_ERROR"
    });
  }
};

// 워크스페이스 소유자 확인 미들웨어
const checkWorkspaceOwner = async (req, res, next) => {
  try {
    const { wsId } = req.params;
    const userId = req.user.userId;
    
    if (!wsId) {
      return res.status(400).json({ 
        error: "워크스페이스 ID가 필요합니다",
        code: "MISSING_WORKSPACE_ID"
      });
    }
    
    const workspace = await prisma.workspace.findFirst({
      where: { id: wsId, ownerId: userId },
    });
    
    if (!workspace) {
      return res.status(403).json({ 
        error: "워크스페이스 소유자만 접근할 수 있습니다",
        code: "OWNER_ACCESS_REQUIRED"
      });
    }
    
    next();
  } catch (error) {
    console.error("워크스페이스 소유자 확인 오류:", error);
    
    // Prisma 관련 에러 처리
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: "워크스페이스를 찾을 수 없습니다",
        code: "WORKSPACE_NOT_FOUND"
      });
    }
    
    res.status(500).json({ 
      error: "서버 오류가 발생했습니다",
      code: "SERVER_ERROR"
    });
  }
};

module.exports = {
  generateTokens,
  authenticateToken,
  checkWorkspaceMember,
  checkWorkspaceOwner,
};
