-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "personalDiscount" INTEGER;

-- AlterTable
ALTER TABLE "Salon" ADD COLUMN     "birthdayGreetingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "birthdayGreetingText" TEXT NOT NULL DEFAULT '{имя}, с днём рождения! 🎉 Дарим вам скидку 10% на любую услугу в течение недели. Ваши «Sезоны»';

-- CreateTable
CREATE TABLE "LoyaltyLevel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "minVisits" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "perks" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "LoyaltyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segment" JSONB NOT NULL,
    "bookButton" BOOLEAN NOT NULL DEFAULT true,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoMessageLog" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLevel_minVisits_key" ON "LoyaltyLevel"("minVisits");

-- CreateIndex
CREATE INDEX "CampaignRecipient_status_idx" ON "CampaignRecipient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_clientId_channel_key" ON "CampaignRecipient"("campaignId", "clientId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "AutoMessageLog_clientId_key_key" ON "AutoMessageLog"("clientId", "key");

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoMessageLog" ADD CONSTRAINT "AutoMessageLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
