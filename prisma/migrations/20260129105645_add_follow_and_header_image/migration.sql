-- AlterTable
ALTER TABLE "User" ADD COLUMN     "headerImage" TEXT;

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotedContent" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "eventId" TEXT,
    "adTitle" TEXT,
    "adDescription" TEXT,
    "adImage" TEXT,
    "adUrl" TEXT,
    "adCtaText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3),
    "promotedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotedContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "PromotedContent_contentType_isActive_idx" ON "PromotedContent"("contentType", "isActive");

-- CreateIndex
CREATE INDEX "PromotedContent_priority_idx" ON "PromotedContent"("priority");

-- CreateIndex
CREATE INDEX "PromotedContent_eventId_idx" ON "PromotedContent"("eventId");

-- CreateIndex
CREATE INDEX "Post_type_idx" ON "Post"("type");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotedContent" ADD CONSTRAINT "PromotedContent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotedContent" ADD CONSTRAINT "PromotedContent_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
