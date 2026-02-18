-- AlterTable
ALTER TABLE "Message"
ADD COLUMN "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "readAt" TIMESTAMP(3);

-- Backfill existing rows with empty arrays to satisfy Prisma defaults
UPDATE "Message" SET "images" = ARRAY[]::TEXT[] WHERE "images" IS NULL;
UPDATE "Message" SET "videos" = ARRAY[]::TEXT[] WHERE "videos" IS NULL;

-- Set NOT NULL for new array columns after backfill
ALTER TABLE "Message"
ALTER COLUMN "images" SET NOT NULL,
ALTER COLUMN "videos" SET NOT NULL;
