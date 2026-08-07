-- AlterTable
ALTER TABLE "TimetableEntry" ADD COLUMN     "secondTeacherId" TEXT;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_secondTeacherId_fkey" FOREIGN KEY ("secondTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

