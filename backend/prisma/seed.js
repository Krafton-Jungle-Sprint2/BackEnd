const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 시드 데이터 생성 시작...");

  // 1. 기본 사용자들 생성
  const hashedPassword = await bcrypt.hash("password123", 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: {},
      create: {
        email: "admin@example.com",
        password: hashedPassword,
        nickname: "관리자",
        role: "admin", // 관리자 역할 부여
      },
    }),
    prisma.user.upsert({
      where: { email: "user1@example.com" },
      update: {},
      create: {
        email: "user1@example.com",
        password: hashedPassword,
        nickname: "김개발",
      },
    }),
    prisma.user.upsert({
      where: { email: "user2@example.com" },
      update: {},
      create: {
        email: "user2@example.com",
        password: hashedPassword,
        nickname: "이디자인",
      },
    }),
  ]);
  console.log(`✅ 사용자 ${users.length}명 생성 완료`);

  // 2. 샘플 개인 Todo 생성 (스키마에 맞게 수정)
  await Promise.all([
    prisma.personalTodo.create({
      data: {
        title: "개인 프로젝트 기획",
        description: "사이드 프로젝트 기획서 초안 작성",
        status: "completed",
        priority: "high",
        startDate: new Date("2025-08-20"),
        dueDate: new Date("2025-08-22"),
        userId: users[1].id, // 김개발의 Todo
      },
    }),
    prisma.personalTodo.create({
      data: {
        title: "포트폴리오 정리",
        description: "디자인 포트폴리오 업데이트 및 정리",
        status: "in_progress",
        priority: "medium",
        startDate: new Date("2025-08-21"),
        dueDate: new Date("2025-08-25"),
        userId: users[2].id, // 이디자인의 Todo
      },
    }),
  ]);
  console.log("✅ 개인 Todo 2개 생성 완료");

  // 3. 샘플 워크스페이스 생성
  const workspace = await prisma.workspace.upsert({
    where: { id: "team-collab-workspace" },
    update: {},
    create: {
      id: "team-collab-workspace",
      name: "팀 협업 프로젝트",
      ownerId: users[0].id, // 관리자가 소유자
    },
  });
  console.log("✅ 워크스페이스 1개 생성 완료");

  // 4. 워크스페이스에 멤버 추가
  await Promise.all([
    // 소유자도 멤버로 추가
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: users[0].id },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: users[0].id,
        accepted: true,
      },
    }),
    // 김개발 멤버로 추가
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: users[1].id },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: users[1].id,
        accepted: true,
      },
    }),
    // 이디자인 멤버로 추가
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: users[2].id },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: users[2].id,
        accepted: true,
      },
    }),
  ]);
  console.log("✅ 워크스페이스 멤버 3명 추가 완료");

  // 5. 샘플 그룹 Task 생성
  await Promise.all([
    prisma.groupTask.create({
      data: {
        workspaceId: workspace.id,
        title: "로그인 API 개발",
        description: "JWT 기반 사용자 인증 API 구현",
        department: "BE",
        status: "in_progress",
        startDate: new Date("2025-08-20"),
        dueDate: new Date("2025-08-27"),
      },
    }),
    prisma.groupTask.create({
      data: {
        workspaceId: workspace.id,
        title: "메인 페이지 UI 디자인",
        description: "Figma를 사용한 메인 페이지 시안 작업",
        department: "FE",
        status: "pending",
        startDate: new Date("2025-08-22"),
        dueDate: new Date("2025-08-29"),
      },
    }),
  ]);
  console.log("✅ 그룹 Task 2개 생성 완료");

  console.log("🎉 시드 데이터 생성 완료!");
  console.log("\n📋 생성된 테스트 계정:");
  console.log("- admin@example.com / password123 (관리자)");
  console.log("- user1@example.com / password123 (김개발)");
  console.log("- user2@example.com / password123 (이디자인)");
}

main()
  .catch((e) => {
    console.error("❌ 시드 데이터 생성 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
