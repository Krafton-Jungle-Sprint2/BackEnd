// src/routes/admin.js - 관리자 라우터
const express = require("express");
const {
  prisma,
  getDatabaseStats,
  cleanupExpiredData,
} = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// 모든 관리자 라우트에 인증 적용
router.use(authenticateToken);

// 관리자 권한 확인 미들웨어
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ 
      error: "관리자 권한이 필요합니다",
      code: "ADMIN_ACCESS_REQUIRED"
    });
  }
  next();
};

// 관리자 권한이 필요한 라우트에만 적용
router.use(requireAdmin);

// 시스템 통계
router.get("/stats", async (req, res) => {
  try {
    const stats = await getDatabaseStats();

    // 추가 통계 정보
    const additionalStats = await Promise.all([
      // 활성 사용자 수 (최근 30일 로그인)
      prisma.user.count({
        where: {
          lastLogin: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 이번 주 생성된 워크스페이스
      prisma.workspace.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 이번 주 완료된 할일
      prisma.personalTodo.count({
        where: {
          status: "completed",
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 만료된 리프레시 토큰 수
      prisma.refreshToken.count({
        where: {
          expiresAt: { lt: new Date() },
        },
      }),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      database: stats,
      additional: {
        activeUsersLast30Days: additionalStats[0],
        workspacesThisWeek: additionalStats[1],
        todosCompletedThisWeek: additionalStats[2],
        expiredTokens: additionalStats[3],
      },
    });
  } catch (error) {
    console.error("시스템 통계 조회 오류:", error);
    res.status(500).json({ error: "통계 조회에 실패했습니다" });
  }
});

// 전체 사용자 목록 (관리용)
router.get("/users", async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {};
    if (search) {
      whereClause.OR = [
        { email: { contains: search } },
        { nickname: { contains: search } },
      ];
    }
    if (status !== undefined) {
      whereClause.isActive = status === "active";
    }

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          _count: {
            select: {
              personalTodos: true,
              ownedWorkspaces: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: offset,
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    res.json({
      users,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("사용자 목록 조회 오류:", error);
    res.status(500).json({ error: "사용자 목록 조회에 실패했습니다" });
  }
});

// 사용자 상태 변경 (활성화/비활성화)
router.patch("/users/:userId/status", async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ error: "isActive는 boolean 값이어야 합니다" });
    }

    // 자기 자신을 비활성화하려는 경우 방지
    if (userId === req.user.userId && !isActive) {
      return res
        .status(400)
        .json({ error: "자기 자신을 비활성화할 수 없습니다" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    // 비활성화 시 모든 리프레시 토큰 삭제
    if (!isActive) {
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error("사용자 상태 변경 오류:", error);
    res.status(500).json({ error: "사용자 상태 변경에 실패했습니다" });
  }
});

// 사용자 역할 변경
router.patch("/users/:userId/role", async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const validRoles = ["admin", "manager", "member"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: "유효하지 않은 역할입니다" });
    }

    // 자기 자신의 관리자 권한을 제거하려는 경우 방지
    if (userId === req.user.userId && role !== "admin") {
      return res
        .status(400)
        .json({ error: "자기 자신의 관리자 권한을 제거할 수 없습니다" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("사용자 역할 변경 오류:", error);
    res.status(500).json({ error: "사용자 역할 변경에 실패했습니다" });
  }
});

// 워크스페이스 목록 (관리용)
router.get("/workspaces", async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {};
    if (search) {
      whereClause.name = { contains: search };
    }

    const [workspaces, totalCount] = await Promise.all([
      prisma.workspace.findMany({
        where: whereClause,
        include: {
          owner: {
            select: { id: true, email: true, nickname: true },
          },
          _count: {
            select: { members: true, tasks: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: offset,
      }),
      prisma.workspace.count({ where: whereClause }),
    ]);

    res.json({
      workspaces,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("워크스페이스 목록 조회 오류:", error);
    res.status(500).json({ error: "워크스페이스 목록 조회에 실패했습니다" });
  }
});

// 워크스페이스 강제 삭제
router.delete("/workspaces/:wsId", async (req, res) => {
  try {
    const { wsId } = req.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id: wsId },
      include: {
        owner: { select: { email: true, nickname: true } },
        _count: { select: { members: true, tasks: true } },
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: "워크스페이스를 찾을 수 없습니다" });
    }

    await prisma.workspace.delete({ where: { id: wsId } });

    res.json({
      message: "워크스페이스가 삭제되었습니다",
      deletedWorkspace: {
        id: wsId,
        name: workspace.name,
        owner: workspace.owner,
        memberCount: workspace._count.members,
        taskCount: workspace._count.tasks,
      },
    });
  } catch (error) {
    console.error("워크스페이스 삭제 오류:", error);
    res.status(500).json({ error: "워크스페이스 삭제에 실패했습니다" });
  }
});

// 시스템 정리 작업
router.post("/cleanup", async (req, res) => {
  try {
    const result = await cleanupExpiredData();

    // 추가 정리 작업
    const additionalCleanup = await Promise.all([
      // 완료된 지 30일 이상 된 할일 삭제 (선택적)
      // prisma.personalTodo.deleteMany({
      //   where: {
      //     status: "completed",
      //     updatedAt: {
      //       lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      //     },
      //   },
      // }),

      // 거절된 친구 요청 정리 (30일 이상)
      prisma.friend.deleteMany({
        where: {
          status: "blocked",
          updatedAt: {
            lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    res.json({
      message: "시스템 정리 작업이 완료되었습니다",
      results: {
        expiredTokens: result.deletedTokens || 0,
        blockedFriendships: additionalCleanup[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error("시스템 정리 작업 오류:", error);
    res.status(500).json({ error: "시스템 정리 작업에 실패했습니다" });
  }
});

// 시스템 로그 조회 (간단한 버전)
router.get("/logs", async (req, res) => {
  try {
    const { level = "info", limit = 100 } = req.query;

    // 실제 환경에서는 로그 파일이나 로그 서비스에서 조회
    // 여기서는 최근 생성된 데이터를 로그처럼 보여줌
    const recentActivities = await Promise.all([
      // 최근 사용자 가입
      prisma.user.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // 최근 워크스페이스 생성
      prisma.workspace.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const logs = [
      ...recentActivities[0].map((user) => ({
        timestamp: user.createdAt,
        level: "info",
        type: "user_signup",
        message: `새 사용자 가입: ${user.email}`,
        data: { userId: user.id },
      })),
      ...recentActivities[1].map((workspace) => ({
        timestamp: workspace.createdAt,
        level: "info",
        type: "workspace_created",
        message: `새 워크스페이스 생성: ${workspace.name}`,
        data: { workspaceId: workspace.id },
      })),
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));

    res.json({ logs });
  } catch (error) {
    console.error("로그 조회 오류:", error);
    res.status(500).json({ error: "로그 조회에 실패했습니다" });
  }
});

// 백업 생성 (간단한 버전)
router.post("/backup", async (req, res) => {
  try {
    const timestamp = new Date().toISOString();

    // 실제 환경에서는 mysqldump 등을 사용
    // 여기서는 중요 통계만 백업
    const backupData = {
      timestamp,
      stats: await getDatabaseStats(),
      userCount: await prisma.user.count(),
      workspaceCount: await prisma.workspace.count(),
      todoCount: await prisma.personalTodo.count(),
      taskCount: await prisma.groupTask.count(),
    };

    res.json({
      message: "백업이 생성되었습니다",
      backup: backupData,
      note: "실제 환경에서는 데이터베이스 덤프 파일이 생성됩니다",
    });
  } catch (error) {
    console.error("백업 생성 오류:", error);
    res.status(500).json({ error: "백업 생성에 실패했습니다" });
  }
});

module.exports = router;
