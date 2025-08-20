// src/routes/workspaces.js - 워크스페이스 라우터
const express = require("express");
const { prisma } = require("../config/database");
const {
  authenticateToken,
  checkWorkspaceMember,
  checkWorkspaceOwner,
} = require("../middleware/auth");

const router = express.Router();

// 워크스페이스 생성
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "워크스페이스 이름은 필수입니다" });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerId: req.user.userId,
      },
      include: {
        owner: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error("워크스페이스 생성 오류:", error);
    res.status(500).json({ error: "워크스페이스 생성에 실패했습니다" });
  }
});

// 내 워크스페이스 목록
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const ownedWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: userId },
      include: {
        owner: { select: { id: true, nickname: true, avatar: true } },
        _count: { select: { members: true, tasks: true } },
      },
    });

    const memberWorkspaces = await prisma.workspaceMember.findMany({
      where: { userId: userId, accepted: true },
      include: {
        workspace: {
          include: {
            owner: { select: { id: true, nickname: true, avatar: true } },
            _count: { select: { members: true, tasks: true } },
          },
        },
      },
    });

    const result = [
      ...ownedWorkspaces.map((ws) => ({ ...ws, role: "owner" })),
      ...memberWorkspaces.map((member) => ({
        ...member.workspace,
        role: "member",
      })),
    ];

    res.json(result);
  } catch (error) {
    console.error("워크스페이스 목록 조회 오류:", error);
    res.status(500).json({ error: "워크스페이스 목록 조회에 실패했습니다" });
  }
});

// 워크스페이스 상세 조회
router.get(
  "/:wsId",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId } = req.params;

      const workspace = await prisma.workspace.findUnique({
        where: { id: wsId },
        include: {
          owner: { select: { id: true, nickname: true, avatar: true } },
          members: {
            include: {
              user: { select: { id: true, nickname: true, avatar: true } },
            },
          },
          _count: { select: { tasks: true } },
        },
      });

      if (!workspace) {
        return res
          .status(404)
          .json({ error: "워크스페이스를 찾을 수 없습니다" });
      }

      res.json(workspace);
    } catch (error) {
      console.error("워크스페이스 상세 조회 오류:", error);
      res.status(500).json({ error: "워크스페이스 조회에 실패했습니다" });
    }
  }
);

// 워크스페이스 수정
router.patch(
  "/:wsId",
  authenticateToken,
  checkWorkspaceOwner,
  async (req, res) => {
    try {
      const { wsId } = req.params;
      const { name, description } = req.body;

      const updateData = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      const updatedWorkspace = await prisma.workspace.update({
        where: { id: wsId },
        data: updateData,
        include: {
          owner: { select: { id: true, nickname: true, avatar: true } },
          _count: { select: { members: true, tasks: true } },
        },
      });

      res.json(updatedWorkspace);
    } catch (error) {
      console.error("워크스페이스 수정 오류:", error);
      res.status(500).json({ error: "워크스페이스 수정에 실패했습니다" });
    }
  }
);

// 워크스페이스 삭제 (소유자만)
router.delete(
  "/:wsId",
  authenticateToken,
  checkWorkspaceOwner,
  async (req, res) => {
    try {
      const { wsId } = req.params;
      await prisma.workspace.delete({ where: { id: wsId } });
      res.status(204).send();
    } catch (error) {
      console.error("워크스페이스 삭제 오류:", error);
      res.status(500).json({ error: "워크스페이스 삭제에 실패했습니다" });
    }
  }
);

// ===============================================
//   워크스페이스 멤버 관리
// ===============================================

// 워크스페이스 멤버 목록
router.get(
  "/:wsId/members",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId } = req.params;

      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: wsId },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, lastLogin: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      });

      const workspace = await prisma.workspace.findUnique({
        where: { id: wsId },
        include: {
          owner: {
            select: { id: true, nickname: true, avatar: true, lastLogin: true },
          },
        },
      });

      const result = [
        {
          user: workspace.owner,
          accepted: true,
          joinedAt: workspace.createdAt,
          role: "owner",
        },
        ...members.map((member) => ({ ...member, role: "member" })),
      ];

      res.json(result);
    } catch (error) {
      console.error("워크스페이스 멤버 조회 오류:", error);
      res.status(500).json({ error: "멤버 조회에 실패했습니다" });
    }
  }
);

// 워크스페이스 멤버 초대
router.post(
  "/:wsId/members",
  authenticateToken,
  checkWorkspaceOwner,
  async (req, res) => {
    try {
      const { wsId } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: "사용자 ID가 필요합니다" });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: user_id },
      });
      if (!targetUser) {
        return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
      }

      // 소유자 자신을 초대하려는 경우
      if (user_id === req.user.userId) {
        return res
          .status(400)
          .json({ error: "자기 자신을 초대할 수 없습니다" });
      }

      const existingMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: wsId, userId: user_id },
      });

      if (existingMember) {
        return res.status(400).json({ error: "이미 워크스페이스 멤버입니다" });
      }

      const member = await prisma.workspaceMember.create({
        data: { workspaceId: wsId, userId: user_id },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          workspace: { select: { id: true, name: true } },
        },
      });

      res.status(201).json(member);
    } catch (error) {
      console.error("워크스페이스 멤버 초대 오류:", error);
      res.status(500).json({ error: "멤버 초대에 실패했습니다" });
    }
  }
);

// 워크스페이스 초대 수락/거절
router.patch("/:wsId/members/:user_id", authenticateToken, async (req, res) => {
  try {
    const { wsId, user_id } = req.params;
    const { accepted } = req.body;
    const currentUserId = req.user.userId;

    if (typeof accepted !== "boolean") {
      return res
        .status(400)
        .json({ error: "accepted 값은 boolean이어야 합니다" });
    }

    if (user_id !== currentUserId) {
      return res
        .status(403)
        .json({ error: "자신의 초대만 수락/거절할 수 있습니다" });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: wsId, userId: user_id },
    });

    if (!member) {
      return res.status(404).json({ error: "초대를 찾을 수 없습니다" });
    }

    if (!accepted) {
      await prisma.workspaceMember.delete({ where: { id: member.id } });
      return res.status(204).send();
    }

    const updatedMember = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { accepted: true },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    res.json(updatedMember);
  } catch (error) {
    console.error("워크스페이스 초대 응답 오류:", error);
    res.status(500).json({ error: "초대 응답에 실패했습니다" });
  }
});

// 워크스페이스 멤버 제거
router.delete(
  "/:wsId/members/:user_id",
  authenticateToken,
  async (req, res) => {
    try {
      const { wsId, user_id } = req.params;
      const currentUserId = req.user.userId;

      // 소유자 권한 확인 또는 본인이 탈퇴하는 경우
      const workspace = await prisma.workspace.findFirst({
        where: { id: wsId, ownerId: currentUserId },
      });

      const isOwner = !!workspace;
      const isSelf = user_id === currentUserId;

      if (!isOwner && !isSelf) {
        return res.status(403).json({ error: "멤버 제거 권한이 없습니다" });
      }

      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: wsId, userId: user_id },
      });

      if (!member) {
        return res.status(404).json({ error: "멤버를 찾을 수 없습니다" });
      }

      await prisma.workspaceMember.delete({ where: { id: member.id } });
      res.status(204).send();
    } catch (error) {
      console.error("워크스페이스 멤버 제거 오류:", error);
      res.status(500).json({ error: "멤버 제거에 실패했습니다" });
    }
  }
);

// 내가 받은 워크스페이스 초대 목록
router.get("/invitations/received", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const invitations = await prisma.workspaceMember.findMany({
      where: {
        userId: userId,
        accepted: false,
      },
      include: {
        workspace: {
          include: {
            owner: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    res.json(invitations);
  } catch (error) {
    console.error("워크스페이스 초대 목록 조회 오류:", error);
    res.status(500).json({ error: "초대 목록 조회에 실패했습니다" });
  }
});

module.exports = router;
