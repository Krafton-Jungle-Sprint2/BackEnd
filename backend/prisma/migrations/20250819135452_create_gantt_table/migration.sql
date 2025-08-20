/*
  Warnings:

  - You are about to drop the column `barColor` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `baselineEnd` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `baselineStart` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `collapsed` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `dependsOn` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `ganttGroup` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `ganttOrder` on the `todos` table. All the data in the column will be lost.
  - You are about to drop the column `isMilestone` on the `todos` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `idx_todos_gantt_group_order` ON `todos`;

-- AlterTable
ALTER TABLE `todos` DROP COLUMN `barColor`,
    DROP COLUMN `baselineEnd`,
    DROP COLUMN `baselineStart`,
    DROP COLUMN `collapsed`,
    DROP COLUMN `dependsOn`,
    DROP COLUMN `ganttGroup`,
    DROP COLUMN `ganttOrder`,
    DROP COLUMN `isMilestone`;

-- CreateTable
CREATE TABLE `gantt` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `todoId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `ganttGroup` VARCHAR(191) NULL,
    `ganttOrder` INTEGER NOT NULL DEFAULT 0,
    `isMilestone` BOOLEAN NOT NULL DEFAULT false,
    `baselineStart` DATETIME(3) NULL,
    `baselineEnd` DATETIME(3) NULL,
    `dependsOn` JSON NULL,
    `barColor` VARCHAR(20) NULL,
    `collapsed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `idx_gantt_user_dates`(`userId`, `startDate`, `endDate`),
    INDEX `idx_gantt_todo`(`todoId`),
    INDEX `idx_gantt_group_order`(`ganttGroup`, `ganttOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gantt` ADD CONSTRAINT `gantt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gantt` ADD CONSTRAINT `gantt_todoId_fkey` FOREIGN KEY (`todoId`) REFERENCES `todos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
