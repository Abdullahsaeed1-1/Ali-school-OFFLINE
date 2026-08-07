-- CreateEnum
CREATE TYPE "HiringStatus" AS ENUM ('HIRED', 'TO_BE_HIRED');

-- DropForeignKey
ALTER TABLE "TeacherClassEligibility" DROP CONSTRAINT "TeacherClassEligibility_classId_fkey";

-- DropForeignKey
ALTER TABLE "TeacherClassEligibility" DROP CONSTRAINT "TeacherClassEligibility_teacherId_fkey";

-- DropIndex
DROP INDEX "TeacherSubject_teacherId_subjectId_key";

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "hiringStatus" "HiringStatus" NOT NULL DEFAULT 'HIRED';

-- AlterTable
ALTER TABLE "TeacherSubject" ADD COLUMN     "classId" TEXT NOT NULL;

-- DropTable
DROP TABLE "TeacherClassEligibility";

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubject_teacherId_subjectId_classId_key" ON "TeacherSubject"("teacherId", "subjectId", "classId");

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

