// src/routes/tasks.js - 단체 Task 라우터
const express = require("express");
const { prisma } = require("../config/database");
const {
  authenticateToken,
  checkWorkspaceMember,
} = require("../middleware/auth");

// 워크스페이스별 라우터 생성
const router = express.Router({ mergeParams: true });

// 단체 Task 목록 조회
router.get("/", authenticateToken, checkWorkspaceMember, async (req, res) => {
  try {
    const { wsId } = req.params;
    const {
      department,
      status,
      from,
      to,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const whereClause = { workspaceId: wsId };

    if (department) whereClause.department = department;
    if (status) whereClause.status = status;
    if (search) {
      whereClause.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // 날짜 필터링
    if (from || to) {
      whereClause.AND = [];
      if (from) {
        whereClause.AND.push({
          OR: [
            { startDate: { gte: new Date(from) } },
            { dueDate: { gte: new Date(from) } },
          ],
        });
      }
      if (to) {
        whereClause.AND.push({
          OR: [
            { startDate: { lte: new Date(to) } },
            { dueDate: { lte: new Date(to) } },
          ],
        });
      }
    }

    const [tasks, totalCount] = await Promise.all([
      prisma.groupTask.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.groupTask.count({ where: whereClause }),
    ]);

    res.json({
      tasks,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: totalCount > parseInt(offset) + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("단체 Task 조회 오류:", error);
    res.status(500).json({ error: "Task 조회에 실패했습니다" });
  }
});

// 단체 Task 생성
router.post("/", authenticateToken, checkWorkspaceMember, async (req, res) => {
  try {
    const { wsId } = req.params;
    const { title, description, department, status, startDate, dueDate } =
      req.body;

    if (!title || !department || !startDate || !dueDate) {
      return res.status(400).json({
        error: "제목, 부서, 시작일, 목표종료일은 필수입니다",
      });
    }

    if (!["FE", "BE", "QA"].includes(department)) {
      return res.status(400).json({
        error: "부서는 FE, BE, QA 중 하나여야 합니다",
      });
    }

    const validStatuses = ["pending", "in_progress", "completed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "유효하지 않은 상태입니다" });
    }

    // 날짜 검증
    const start = new Date(startDate);
    const due = new Date(dueDate);

    if (due <= start) {
      return res
        .status(400)
        .json({ error: "목표종료일은 시작일보다 늦어야 합니다" });
    }

    const task = await prisma.groupTask.create({
      data: {
        workspaceId: wsId,
        title,
        description,
        department,
        status: status || "pending",
        startDate: start,
        dueDate: due,
      },
    });

    res.status(201).json(task);
  } catch (error) {
    console.error("단체 Task 생성 오류:", error);
    res.status(500).json({ error: "Task 생성에 실패했습니다" });
  }
});

// 단체 Task 상세 조회
router.get(
  "/:taskId",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId, taskId } = req.params;

      const task = await prisma.groupTask.findFirst({
        where: { id: taskId, workspaceId: wsId },
        include: {
          workspace: {
            select: { id: true, name: true },
          },
        },
      });

      if (!task) {
        return res.status(404).json({ error: "Task를 찾을 수 없습니다" });
      }

      res.json(task);
    } catch (error) {
      console.error("단체 Task 상세 조회 오류:", error);
      res.status(500).json({ error: "Task 조회에 실패했습니다" });
    }
  }
);

// 단체 Task 수정
router.patch(
  "/:taskId",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId, taskId } = req.params;
      const updateData = req.body;

      const existingTask = await prisma.groupTask.findFirst({
        where: { id: taskId, workspaceId: wsId },
      });

      if (!existingTask) {
        return res.status(404).json({ error: "Task를 찾을 수 없습니다" });
      }

      // 날짜 변환
      if (updateData.startDate)
        updateData.startDate = new Date(updateData.startDate);
      if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);

      // 부서 유효성 검사
      if (
        updateData.department &&
        !["FE", "BE", "QA"].includes(updateData.department)
      ) {
        return res.status(400).json({
          error: "부서는 FE, BE, QA 중 하나여야 합니다",
        });
      }

      // 상태 유효성 검사
      const validStatuses = ["pending", "in_progress", "completed"];
      if (updateData.status && !validStatuses.includes(updateData.status)) {
        return res.status(400).json({ error: "유효하지 않은 상태입니다" });
      }

      // 날짜 검증 (둘 다 업데이트하는 경우)
      if (updateData.startDate && updateData.dueDate) {
        if (updateData.dueDate <= updateData.startDate) {
          return res
            .status(400)
            .json({ error: "목표종료일은 시작일보다 늦어야 합니다" });
        }
      }

      const updatedTask = await prisma.groupTask.update({
        where: { id: taskId },
        data: updateData,
      });

      res.json(updatedTask);
    } catch (error) {
      console.error("단체 Task 수정 오류:", error);
      res.status(500).json({ error: "Task 수정에 실패했습니다" });
    }
  }
);

// 단체 Task 삭제
router.delete(
  "/:taskId",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId, taskId } = req.params;

      const existingTask = await prisma.groupTask.findFirst({
        where: { id: taskId, workspaceId: wsId },
      });

      if (!existingTask) {
        return res.status(404).json({ error: "Task를 찾을 수 없습니다" });
      }

      await prisma.groupTask.delete({ where: { id: taskId } });
      res.status(204).send();
    } catch (error) {
      console.error("단체 Task 삭제 오류:", error);
      res.status(500).json({ error: "Task 삭제에 실패했습니다" });
    }
  }
);

// 워크스페이스 Task 통계
router.get(
  "/stats/summary",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId } = req.params;

      const [statusStats, departmentStats, totalTasks] = await Promise.all([
        prisma.groupTask.groupBy({
          by: ["status"],
          where: { workspaceId: wsId },
          _count: { id: true },
        }),
        prisma.groupTask.groupBy({
          by: ["department"],
          where: { workspaceId: wsId },
          _count: { id: true },
        }),
        prisma.groupTask.count({ where: { workspaceId: wsId } }),
      ]);

      const result = {
        byStatus: {
          pending: 0,
          in_progress: 0,
          completed: 0,
          total: totalTasks,
        },
        byDepartment: {
          FE: 0,
          BE: 0,
          QA: 0,
        },
      };

      statusStats.forEach((stat) => {
        result.byStatus[stat.status] = stat._count.id;
      });

      departmentStats.forEach((stat) => {
        result.byDepartment[stat.department] = stat._count.id;
      });

      // 이번 주 완료된 Task
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekCompleted = await prisma.groupTask.count({
        where: {
          workspaceId: wsId,
          status: "completed",
          updatedAt: { gte: weekStart },
        },
      });

      result.weekCompleted = weekCompleted;

      // 마감 임박 Task (3일 이내)
      const threeDaysLater = new Date();
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);

      const upcomingDeadlines = await prisma.groupTask.count({
        where: {
          workspaceId: wsId,
          status: { not: "completed" },
          dueDate: {
            lte: threeDaysLater,
            gte: new Date(),
          },
        },
      });

      result.upcomingDeadlines = upcomingDeadlines;

      res.json(result);
    } catch (error) {
      console.error("워크스페이스 Task 통계 조회 오류:", error);
      res.status(500).json({ error: "통계 조회에 실패했습니다" });
    }
  }
);

// Task 벌크 상태 업데이트
router.patch(
  "/bulk/status",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId } = req.params;
      const { taskIds, status } = req.body;

      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res
          .status(400)
          .json({ error: "유효한 Task ID 배열이 필요합니다" });
      }

      const validStatuses = ["pending", "in_progress", "completed"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "유효하지 않은 상태입니다" });
      }

      // 워크스페이스 내 Task만 업데이트
      const result = await prisma.groupTask.updateMany({
        where: {
          id: { in: taskIds },
          workspaceId: wsId,
        },
        data: { status },
      });

      res.json({
        message: `${result.count}개의 Task 상태가 업데이트되었습니다`,
        updatedCount: result.count,
      });
    } catch (error) {
      console.error("Task 벌크 업데이트 오류:", error);
      res.status(500).json({ error: "Task 업데이트에 실패했습니다" });
    }
  }
);

// 부서별 Task 목록
router.get(
  "/departments/:department",
  authenticateToken,
  checkWorkspaceMember,
  async (req, res) => {
    try {
      const { wsId, department } = req.params;
      const { status, limit = 20 } = req.query;

      if (!["FE", "BE", "QA"].includes(department)) {
        return res.status(400).json({
          error: "부서는 FE, BE, QA 중 하나여야 합니다",
        });
      }

      const whereClause = {
        workspaceId: wsId,
        department: department,
      };

      if (status) whereClause.status = status;

      const tasks = await prisma.groupTask.findMany({
        where: whereClause,
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        take: parseInt(limit),
      });

      res.json(tasks);
    } catch (error) {
      console.error("부서별 Task 조회 오류:", error);
      res.status(500).json({ error: "Task 조회에 실패했습니다" });
    }
  }
);

module.exports = router;
