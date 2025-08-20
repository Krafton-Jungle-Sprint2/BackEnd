// src/routes/todos.js - 개인 Todo 라우터
const express = require("express");
const { prisma } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// 개인 Todo 목록 조회
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status, priority, from, to, limit = 50, offset = 0 } = req.query;
    const userId = req.user.userId;

    const whereClause = { userId };
    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;

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

    const [todos, totalCount] = await Promise.all([
      prisma.personalTodo.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.personalTodo.count({ where: whereClause }),
    ]);

    res.json({
      todos,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: totalCount > parseInt(offset) + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("개인 Todo 조회 오류:", error);
    res.status(500).json({ error: "Todo 조회에 실패했습니다" });
  }
});

// 개인 Todo 생성
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, description, status, priority, startDate, dueDate } =
      req.body;

    if (!title) {
      return res.status(400).json({ error: "제목은 필수입니다" });
    }

    // 상태 및 우선순위 검증
    const validStatuses = ["pending", "in_progress", "completed"];
    const validPriorities = ["low", "medium", "high"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "유효하지 않은 상태입니다" });
    }

    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ error: "유효하지 않은 우선순위입니다" });
    }

    const todo = await prisma.personalTodo.create({
      data: {
        userId: req.user.userId,
        title,
        description,
        status: status || "pending",
        priority: priority || "medium",
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    res.status(201).json(todo);
  } catch (error) {
    console.error("개인 Todo 생성 오류:", error);
    res.status(500).json({ error: "Todo 생성에 실패했습니다" });
  }
});

// 개인 Todo 상세 조회
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const todo = await prisma.personalTodo.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!todo) {
      return res.status(404).json({ error: "Todo를 찾을 수 없습니다" });
    }

    res.json(todo);
  } catch (error) {
    console.error("개인 Todo 상세 조회 오류:", error);
    res.status(500).json({ error: "Todo 조회에 실패했습니다" });
  }
});

// 개인 Todo 수정
router.patch("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existingTodo = await prisma.personalTodo.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "Todo를 찾을 수 없습니다" });
    }

    // 상태 및 우선순위 검증
    const validStatuses = ["pending", "in_progress", "completed"];
    const validPriorities = ["low", "medium", "high"];

    if (updateData.status && !validStatuses.includes(updateData.status)) {
      return res.status(400).json({ error: "유효하지 않은 상태입니다" });
    }

    if (updateData.priority && !validPriorities.includes(updateData.priority)) {
      return res.status(400).json({ error: "유효하지 않은 우선순위입니다" });
    }

    // 날짜 변환
    if (updateData.startDate)
      updateData.startDate = new Date(updateData.startDate);
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);

    const updatedTodo = await prisma.personalTodo.update({
      where: { id },
      data: updateData,
    });

    res.json(updatedTodo);
  } catch (error) {
    console.error("개인 Todo 수정 오류:", error);
    res.status(500).json({ error: "Todo 수정에 실패했습니다" });
  }
});

// 개인 Todo 삭제
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existingTodo = await prisma.personalTodo.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "Todo를 찾을 수 없습니다" });
    }

    await prisma.personalTodo.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("개인 Todo 삭제 오류:", error);
    res.status(500).json({ error: "Todo 삭제에 실패했습니다" });
  }
});

// 개인 Todo 통계
router.get("/stats/summary", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await prisma.personalTodo.groupBy({
      by: ["status"],
      where: { userId },
      _count: { id: true },
    });

    const priorityStats = await prisma.personalTodo.groupBy({
      by: ["priority"],
      where: { userId },
      _count: { id: true },
    });

    const result = {
      byStatus: {
        pending: 0,
        in_progress: 0,
        completed: 0,
        total: 0,
      },
      byPriority: {
        low: 0,
        medium: 0,
        high: 0,
      },
    };

    stats.forEach((stat) => {
      result.byStatus[stat.status] = stat._count.id;
      result.byStatus.total += stat._count.id;
    });

    priorityStats.forEach((stat) => {
      result.byPriority[stat.priority] = stat._count.id;
    });

    // 이번 주 완료된 할일
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekCompleted = await prisma.personalTodo.count({
      where: {
        userId,
        status: "completed",
        updatedAt: { gte: weekStart },
      },
    });

    result.weekCompleted = weekCompleted;

    res.json(result);
  } catch (error) {
    console.error("개인 Todo 통계 조회 오류:", error);
    res.status(500).json({ error: "통계 조회에 실패했습니다" });
  }
});

// 완료율 업데이트 (벌크 작업)
router.patch("/bulk/status", authenticateToken, async (req, res) => {
  try {
    const { todoIds, status } = req.body;

    if (!todoIds || !Array.isArray(todoIds) || todoIds.length === 0) {
      return res
        .status(400)
        .json({ error: "유효한 Todo ID 배열이 필요합니다" });
    }

    const validStatuses = ["pending", "in_progress", "completed"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: "유효하지 않은 상태입니다" });
    }

    // 사용자 소유 Todo만 업데이트
    const result = await prisma.personalTodo.updateMany({
      where: {
        id: { in: todoIds },
        userId: req.user.userId,
      },
      data: { status },
    });

    res.json({
      message: `${result.count}개의 Todo 상태가 업데이트되었습니다`,
      updatedCount: result.count,
    });
  } catch (error) {
    console.error("Todo 벌크 업데이트 오류:", error);
    res.status(500).json({ error: "Todo 업데이트에 실패했습니다" });
  }
});

module.exports = router;
