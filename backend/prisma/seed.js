const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 시드 데이터 생성 시작...");

  // 기본 사용자들 생성
  const hashedPassword = await bcrypt.hash("password123", 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: {},
      create: {
        email: "admin@example.com",
        password: hashedPassword,
        nickname: "관리자",
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

  // 기본 채팅방 생성
  const chatRooms = await Promise.all([
    prisma.chatRoom.upsert({
      where: { id: "general-room" },
      update: {},
      create: {
        id: "general-room",
        name: "일반 채팅",
        description: "전체 팀원들의 일반적인 대화방입니다.",
      },
    }),
    prisma.chatRoom.upsert({
      where: { id: "dev-room" },
      update: {},
      create: {
        id: "dev-room",
        name: "개발팀",
        description: "개발 관련 논의방입니다.",
      },
    }),
    prisma.chatRoom.upsert({
      where: { id: "design-room" },
      update: {},
      create: {
        id: "design-room",
        name: "디자인팀",
        description: "디자인 관련 논의방입니다.",
      },
    }),
  ]);

  console.log(`✅ 채팅방 ${chatRooms.length}개 생성 완료`);

  // 샘플 TODO 생성
  const todos = await Promise.all([
    prisma.todo.create({
      data: {
        title: "프로젝트 기획 완료",
        description: "전체 프로젝트 기획서 작성 및 검토",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-07"),
        status: "completed",
        progress: 100,
        priority: "high",
        userId: users[0].id,
      },
    }),
    prisma.todo.create({
      data: {
        title: "백엔드 API 개발",
        description: "사용자 인증 및 채팅 API 구현",
        startDate: new Date("2024-01-08"),
        endDate: new Date("2024-01-15"),
        status: "in_progress",
        progress: 70,
        priority: "high",
        userId: users[1].id,
      },
    }),
    prisma.todo.create({
      data: {
        title: "UI/UX 디자인",
        description: "메인 페이지 및 채팅 인터페이스 디자인",
        startDate: new Date("2024-01-10"),
        endDate: new Date("2024-01-18"),
        status: "pending",
        progress: 30,
        priority: "medium",
        userId: users[2].id,
      },
    }),
  ]);

  console.log(`✅ TODO ${todos.length}개 생성 완료`);

  // 샘플 채팅 메시지
  await prisma.chatMessage.createMany({
    data: [
      {
        text: "안녕하세요! 팀 프로젝트를 시작해봅시다.",
        roomId: "general-room",
        userId: users[0].id,
      },
      {
        text: "백엔드 API 개발 진행 상황 공유드립니다.",
        roomId: "dev-room",
        userId: users[1].id,
      },
      {
        text: "디자인 시안 검토 부탁드려요~",
        roomId: "design-room",
        userId: users[2].id,
      },
    ],
  });

  console.log("✅ 샘플 채팅 메시지 생성 완료");
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
