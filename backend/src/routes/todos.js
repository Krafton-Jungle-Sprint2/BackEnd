const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken } = require("./auth");

const router = express.Router();
const prisma = new PrismaClient();

// 할일 목록 조회 (필터링, 페이지네이션 지원)
router.get("/todos", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Where 조건 구성
    let whereClause = { userId: req.user.userId };

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (priority && priority !== "all") {
      whereClause.priority = priority;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // OrderBy 조건 구성
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    const [todos, total] = await Promise.all([
      prisma.todo.findMany({
        where: whereClause,
        orderBy,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.todo.count({ where: whereClause }),
    ]);

    res.json({
      todos,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / take),
        totalItems: total,
        limit: take,
      },
    });
  } catch (error) {
    console.error("Get todos error:", error);
    res.status(500).json({ error: "Failed to get todos" });
  }
});

// 특정 할일 조회
router.get("/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const todo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
      },
    });

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json(todo);
  } catch (error) {
    console.error("Get todo error:", error);
    res.status(500).json({ error: "Failed to get todo" });
  }
});

// 새 할일 생성
router.post("/todos", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      priority = "medium",
      startDate,
      endDate,
      estimatedHours,
      tags,
    } = req.body;

    // 필수 필드 검증
    if (!title || !endDate) {
      return res.status(400).json({ error: "Title and end date are required" });
    }

    // 날짜 검증
    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(endDate);

    if (start >= end) {
      return res
        .status(400)
        .json({ error: "End date must be after start date" });
    }

    const todo = await prisma.todo.create({
      data: {
        title,
        description,
        priority,
        startDate: start,
        endDate: end,
        estimatedHours: estimatedHours ? parseInt(estimatedHours) : null,
        tags: tags ? JSON.stringify(tags) : null,
        userId: req.user.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
      },
    });

    res.status(201).json(todo);
  } catch (error) {
    console.error("Create todo error:", error);
    res.status(500).json({ error: "Failed to create todo" });
  }
});

// 할일 수정
router.put("/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // 소유자 확인
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    // 날짜 유효성 검사
    if (updateData.startDate && updateData.endDate) {
      const start = new Date(updateData.startDate);
      const end = new Date(updateData.endDate);

      if (start >= end) {
        return res
          .status(400)
          .json({ error: "End date must be after start date" });
      }
    }

    // tags가 배열이면 JSON으로 변환
    if (updateData.tags && Array.isArray(updateData.tags)) {
      updateData.tags = JSON.stringify(updateData.tags);
    }

    // progress 유효성 검사
    if (updateData.progress !== undefined) {
      const progress = parseInt(updateData.progress);
      if (progress < 0 || progress > 100) {
        return res
          .status(400)
          .json({ error: "Progress must be between 0 and 100" });
      }
      updateData.progress = progress;

      // 진행률에 따라 상태 자동 변경
      if (progress === 0 && updateData.status !== "cancelled") {
        updateData.status = "pending";
      } else if (progress > 0 && progress < 100) {
        updateData.status = "in_progress";
      } else if (progress === 100) {
        updateData.status = "completed";
      }
    }

    const updatedTodo = await prisma.todo.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
      },
    });

    res.json(updatedTodo);
  } catch (error) {
    console.error("Update todo error:", error);
    res.status(500).json({ error: "Failed to update todo" });
  }
});

// 할일 삭제
router.delete("/todos/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 소유자 확인
    const todo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    await prisma.todo.delete({
      where: { id },
    });

    res.json({ message: "Todo deleted successfully" });
  } catch (error) {
    console.error("Delete todo error:", error);
    res.status(500).json({ error: "Failed to delete todo" });
  }
});

// 할일 통계 조회
router.get("/todos-stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await prisma.todo.groupBy({
      by: ["status"],
      where: { userId },
      _count: {
        status: true,
      },
    });

    const totalTodos = await prisma.todo.count({
      where: { userId },
    });

    const overdueTodos = await prisma.todo.count({
      where: {
        userId,
        endDate: { lt: new Date() },
        status: { not: "completed" },
      },
    });

    res.json({
      total: totalTodos,
      overdue: overdueTodos,
      byStatus: stats.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Get todos stats error:", error);
    res.status(500).json({ error: "Failed to get todos statistics" });
  }
});

module.exports = router;
