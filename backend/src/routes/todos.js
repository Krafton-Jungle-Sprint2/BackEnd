const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// 할일 목록 조회
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, completed, priority } = req.query;
    const skip = (page - 1) * limit;

    // 필터 조건 구성
    const where = {
      userId: req.user.userId,
    };

    if (completed !== undefined) {
      where.completed = completed === "true";
    }

    if (priority) {
      where.priority = priority;
    }

    // 할일 조회
    const todos = await prisma.todo.findMany({
      where,
      orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    // 전체 개수 조회
    const totalCount = await prisma.todo.count({ where });

    res.json({
      todos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("할일 목록 조회 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 할일 상세 조회
router.get("/:id", async (req, res) => {
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
          },
        },
      },
    });

    if (!todo) {
      return res.status(404).json({ error: "할일을 찾을 수 없습니다." });
    }

    res.json({ todo });
  } catch (error) {
    console.error("할일 상세 조회 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 할일 생성
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      priority = "medium",
    } = req.body;

    // 입력 검증
    if (!title) {
      return res.status(400).json({ error: "제목을 입력해주세요." });
    }

    // 날짜 검증
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res
        .status(400)
        .json({ error: "시작일은 종료일보다 이전이어야 합니다." });
    }

    const todo = await prisma.todo.create({
      data: {
        title,
        description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        priority,
        userId: req.user.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "할일이 생성되었습니다.",
      todo,
    });
  } catch (error) {
    console.error("할일 생성 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 할일 수정
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, completed, startDate, endDate, priority } =
      req.body;

    // 할일 존재 확인
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "할일을 찾을 수 없습니다." });
    }

    // 날짜 검증
    const newStartDate = startDate
      ? new Date(startDate)
      : existingTodo.startDate;
    const newEndDate = endDate ? new Date(endDate) : existingTodo.endDate;

    if (newStartDate && newEndDate && newStartDate > newEndDate) {
      return res
        .status(400)
        .json({ error: "시작일은 종료일보다 이전이어야 합니다." });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (completed !== undefined) updateData.completed = completed;
    if (startDate !== undefined)
      updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
      updateData.endDate = endDate ? new Date(endDate) : null;
    if (priority !== undefined) updateData.priority = priority;

    const todo = await prisma.todo.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    res.json({
      message: "할일이 수정되었습니다.",
      todo,
    });
  } catch (error) {
    console.error("할일 수정 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 할일 삭제
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 할일 존재 확인
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTodo) {
      return res.status(404).json({ error: "할일을 찾을 수 없습니다." });
    }

    await prisma.todo.delete({
      where: { id },
    });

    res.json({ message: "할일이 삭제되었습니다." });
  } catch (error) {
    console.error("할일 삭제 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

// 간트차트용 데이터 조회
router.get("/gantt/data", async (req, res) => {
  try {
    const todos = await prisma.todo.findMany({
      where: {
        userId: req.user.userId,
        AND: [{ startDate: { not: null } }, { endDate: { not: null } }],
      },
      orderBy: {
        startDate: "asc",
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    const ganttData = todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      start: todo.startDate,
      end: todo.endDate,
      progress: todo.completed ? 100 : 0,
      priority: todo.priority,
      completed: todo.completed,
    }));

    res.json({ ganttData });
  } catch (error) {
    console.error("간트차트 데이터 조회 에러:", error);
    res.status(500).json({ error: "서버 에러가 발생했습니다." });
  }
});

module.exports = router;
