const express = require("express");
const router = express.Router();

// 메모리 기반 간트차트 데이터 저장소 (실제로는 DB 사용)
let ganttTasks = [
  {
    id: 1,
    name: "프로젝트 기획",
    startDate: "2024-01-01",
    endDate: "2024-01-07",
    progress: 100,
    dependencies: [],
    assignee: "김철수",
    priority: "High",
    status: "Completed",
  },
  {
    id: 2,
    name: "요구사항 분석",
    startDate: "2024-01-08",
    endDate: "2024-01-14",
    progress: 100,
    dependencies: [1],
    assignee: "이영희",
    priority: "High",
    status: "Completed",
  },
  {
    id: 3,
    name: "UI/UX 디자인",
    startDate: "2024-01-15",
    endDate: "2024-01-28",
    progress: 75,
    dependencies: [2],
    assignee: "박민수",
    priority: "Medium",
    status: "In Progress",
  },
  {
    id: 4,
    name: "백엔드 개발",
    startDate: "2024-01-22",
    endDate: "2024-02-15",
    progress: 30,
    dependencies: [2],
    assignee: "최진영",
    priority: "High",
    status: "In Progress",
  },
  {
    id: 5,
    name: "프론트엔드 개발",
    startDate: "2024-01-29",
    endDate: "2024-02-20",
    progress: 0,
    dependencies: [3],
    assignee: "정수현",
    priority: "High",
    status: "Not Started",
  },
  {
    id: 6,
    name: "테스트 및 QA",
    startDate: "2024-02-16",
    endDate: "2024-02-28",
    progress: 0,
    dependencies: [4, 5],
    assignee: "한민주",
    priority: "Medium",
    status: "Not Started",
  },
];

let nextId = 7;

// 모든 간트차트 태스크 조회
router.get("/gantt/tasks", (req, res) => {
  try {
    res.json({
      success: true,
      data: ganttTasks,
      message: "Tasks retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve tasks",
    });
  }
});

// 특정 태스크 조회
router.get("/gantt/tasks/:id", (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = ganttTasks.find((t) => t.id === taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    res.json({
      success: true,
      data: task,
      message: "Task retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve task",
    });
  }
});

// 새 태스크 생성
router.post("/gantt/tasks", (req, res) => {
  try {
    const { name, startDate, endDate, assignee, priority, dependencies } =
      req.body;

    // 필수 필드 검증
    if (!name || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "Name, startDate, and endDate are required",
      });
    }

    // 날짜 유효성 검증
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: "End date must be after start date",
      });
    }

    const newTask = {
      id: nextId++,
      name,
      startDate,
      endDate,
      progress: 0,
      dependencies: dependencies || [],
      assignee: assignee || "",
      priority: priority || "Medium",
      status: "Not Started",
    };

    ganttTasks.push(newTask);

    res.status(201).json({
      success: true,
      data: newTask,
      message: "Task created successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to create task",
    });
  }
});

// 태스크 수정
router.put("/gantt/tasks/:id", (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const taskIndex = ganttTasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    const {
      name,
      startDate,
      endDate,
      progress,
      assignee,
      priority,
      status,
      dependencies,
    } = req.body;

    // 날짜 유효성 검증 (제공된 경우)
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start >= end) {
        return res.status(400).json({
          success: false,
          error: "End date must be after start date",
        });
      }
    }

    // 진행률 유효성 검증
    if (progress !== undefined && (progress < 0 || progress > 100)) {
      return res.status(400).json({
        success: false,
        error: "Progress must be between 0 and 100",
      });
    }

    // 태스크 업데이트
    const updatedTask = {
      ...ganttTasks[taskIndex],
      ...(name && { name }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(progress !== undefined && { progress }),
      ...(assignee !== undefined && { assignee }),
      ...(priority && { priority }),
      ...(status && { status }),
      ...(dependencies !== undefined && { dependencies }),
    };

    ganttTasks[taskIndex] = updatedTask;

    res.json({
      success: true,
      data: updatedTask,
      message: "Task updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update task",
    });
  }
});

// 태스크 삭제
router.delete("/gantt/tasks/:id", (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const taskIndex = ganttTasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // 의존성 체크 - 다른 태스크가 이 태스크에 의존하고 있는지 확인
    const dependentTasks = ganttTasks.filter(
      (task) => task.dependencies && task.dependencies.includes(taskId)
    );

    if (dependentTasks.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete task: other tasks depend on this task",
        dependentTasks: dependentTasks.map((t) => ({ id: t.id, name: t.name })),
      });
    }

    const deletedTask = ganttTasks.splice(taskIndex, 1)[0];

    res.json({
      success: true,
      data: deletedTask,
      message: "Task deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to delete task",
    });
  }
});

// 태스크 진행률 업데이트
router.patch("/gantt/tasks/:id/progress", (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { progress } = req.body;

    if (progress === undefined || progress < 0 || progress > 100) {
      return res.status(400).json({
        success: false,
        error: "Progress must be between 0 and 100",
      });
    }

    const taskIndex = ganttTasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // 진행률에 따른 상태 자동 업데이트
    let status = ganttTasks[taskIndex].status;
    if (progress === 0) {
      status = "Not Started";
    } else if (progress === 100) {
      status = "Completed";
    } else {
      status = "In Progress";
    }

    ganttTasks[taskIndex].progress = progress;
    ganttTasks[taskIndex].status = status;

    res.json({
      success: true,
      data: ganttTasks[taskIndex],
      message: "Progress updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update progress",
    });
  }
});

// 프로젝트 타임라인 조회 (간트차트 뷰용)
router.get("/gantt/timeline", (req, res) => {
  try {
    // 시작일과 종료일 계산
    const startDates = ganttTasks.map((task) => new Date(task.startDate));
    const endDates = ganttTasks.map((task) => new Date(task.endDate));

    const projectStart = new Date(Math.min(...startDates));
    const projectEnd = new Date(Math.max(...endDates));

    // 전체 프로젝트 진행률 계산
    const totalProgress =
      ganttTasks.reduce((sum, task) => sum + task.progress, 0) /
      ganttTasks.length;

    // 상태별 태스크 수 계산
    const statusCounts = ganttTasks.reduce((counts, task) => {
      counts[task.status] = (counts[task.status] || 0) + 1;
      return counts;
    }, {});

    res.json({
      success: true,
      data: {
        tasks: ganttTasks,
        timeline: {
          projectStart: projectStart.toISOString().split("T")[0],
          projectEnd: projectEnd.toISOString().split("T")[0],
          totalDays: Math.ceil(
            (projectEnd - projectStart) / (1000 * 60 * 60 * 24)
          ),
          totalProgress: Math.round(totalProgress * 100) / 100,
        },
        statistics: {
          totalTasks: ganttTasks.length,
          statusCounts,
          completedTasks: statusCounts["Completed"] || 0,
          inProgressTasks: statusCounts["In Progress"] || 0,
          notStartedTasks: statusCounts["Not Started"] || 0,
        },
      },
      message: "Timeline data retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve timeline data",
    });
  }
});

// 크리티컬 패스 계산 (간단한 버전)
router.get("/gantt/critical-path", (req, res) => {
  try {
    // 의존성이 많은 태스크들을 크리티컬 패스로 간주
    const criticalTasks = ganttTasks.filter((task) => {
      const dependentCount = ganttTasks.filter(
        (t) => t.dependencies && t.dependencies.includes(task.id)
      ).length;
      return dependentCount > 0 || task.dependencies.length > 0;
    });

    res.json({
      success: true,
      data: criticalTasks,
      message: "Critical path calculated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to calculate critical path",
    });
  }
});

module.exports = router;
