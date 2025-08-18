const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 시드 데이터 생성 시작...");

  // 기존 데이터 삭제 (개발용)
  await prisma.chatMessage.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.user.deleteMany();

  // 테스트 사용자 생성
  const hashedPassword = await bcrypt.hash("123456", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "admin@example.com",
        password: hashedPassword,
        nickname: "관리자",
      },
    }),
    prisma.user.create({
      data: {
        email: "user1@example.com",
        password: hashedPassword,
        nickname: "김개발",
      },
    }),
    prisma.user.create({
      data: {
        email: "user2@example.com",
        password: hashedPassword,
        nickname: "박디자인",
      },
    }),
  ]);

  console.log("✅ 사용자 생성 완료:", users.length, "명");

  // 채팅방 생성
  const chatRooms = await Promise.all([
    prisma.chatRoom.create({
      data: {
        name: "일반 채팅",
        description: "자유롭게 대화하는 공간입니다.",
        isPrivate: false,
      },
    }),
    prisma.chatRoom.create({
      data: {
        name: "개발팀",
        description: "개발 관련 논의",
        isPrivate: false,
      },
    }),
    prisma.chatRoom.create({
      data: {
        name: "기획팀",
        description: "기획 관련 논의",
        isPrivate: true,
      },
    }),
  ]);

  console.log("✅ 채팅방 생성 완료:", chatRooms.length, "개");

  // 샘플 메시지 생성
  await prisma.chatMessage.createMany({
    data: [
      {
        content: "안녕하세요! 프로젝트 시작해봅시다 🚀",
        userId: users[0].id,
        roomId: chatRooms[0].id,
      },
      {
        content: "네, 잘 부탁드립니다!",
        userId: users[1].id,
        roomId: chatRooms[0].id,
      },
      {
        content: "API 설계부터 시작할까요?",
        userId: users[1].id,
        roomId: chatRooms[1].id,
      },
      {
        content: "좋습니다. 먼저 인증 API부터 만들어볼게요.",
        userId: users[0].id,
        roomId: chatRooms[1].id,
      },
    ],
  });

  console.log("✅ 샘플 메시지 생성 완료");

  // 샘플 ToDo 생성
  const todos = await Promise.all([
    prisma.todo.create({
      data: {
        title: "프로젝트 초기 설정",
        description: "Express, Socket.IO, Prisma 설정",
        completed: true,
        priority: "high",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-03"),
        userId: users[0].id,
      },
    }),
    prisma.todo.create({
      data: {
        title: "인증 시스템 구현",
        description: "JWT 기반 로그인/회원가입 API",
        completed: false,
        priority: "high",
        startDate: new Date("2024-01-02"),
        endDate: new Date("2024-01-05"),
        userId: users[1].id,
      },
    }),
    prisma.todo.create({
      data: {
        title: "ToDo CRUD API 개발",
        description: "할일 생성, 조회, 수정, 삭제 기능",
        completed: false,
        priority: "medium",
        startDate: new Date("2024-01-04"),
        endDate: new Date("2024-01-08"),
        userId: users[1].id,
      },
    }),
    prisma.todo.create({
      data: {
        title: "실시간 채팅 구현",
        description: "Socket.IO를 이용한 실시간 채팅",
        completed: false,
        priority: "medium",
        startDate: new Date("2024-01-06"),
        endDate: new Date("2024-01-10"),
        userId: users[0].id,
      },
    }),
    prisma.todo.create({
      data: {
        title: "간트차트 개발",
        description: "ToDo 기반 간트차트 뷰 구현",
        completed: false,
        priority: "low",
        startDate: new Date("2024-01-08"),
        endDate: new Date("2024-01-12"),
        userId: users[2].id,
      },
    }),
  ]);

  console.log("✅ 샘플 ToDo 생성 완료:", todos.length, "개");

  console.log("🎉 시드 데이터 생성 완료!");
  console.log("\n📋 테스트 계정 정보:");
  console.log("- admin@example.com / 123456 (관리자)");
  console.log("- user1@example.com / 123456 (김개발)");
  console.log("- user2@example.com / 123456 (박디자인)");
}

main()
  .catch((e) => {
    console.error("❌ 시드 데이터 생성 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
