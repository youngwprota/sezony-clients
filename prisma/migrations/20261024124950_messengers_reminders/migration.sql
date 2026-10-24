-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "remindDaySentAt" TIMESTAMPTZ(3),
ADD COLUMN     "remindHoursSentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "birthday" TEXT,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "viberUserId" TEXT;

-- AlterTable
ALTER TABLE "Salon" ADD COLUMN     "remindDayBefore" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "remindHoursBefore" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "viberUserId" TEXT;

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");
