-- AlterTable
ALTER TABLE `todos` ADD COLUMN `barColor` VARCHAR(20) NULL,
    ADD COLUMN `baselineEnd` DATETIME(3) NULL,
    ADD COLUMN `baselineStart` DATETIME(3) NULL,
    ADD COLUMN `collapsed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `dependsOn` JSON NULL,
    ADD COLUMN `ganttGroup` VARCHAR(191) NULL,
    ADD COLUMN `ganttOrder` INTEGER NULL DEFAULT 0,
    ADD COLUMN `isMilestone` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `idx_todos_gantt_group_order` ON `todos`(`ganttGroup`, `ganttOrder`);
