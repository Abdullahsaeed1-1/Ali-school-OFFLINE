-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "gamesProtectedLectures" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "gamesProtectionConfirmed" BOOLEAN NOT NULL DEFAULT false;
