-- CreateEnum
CREATE TYPE "SubjectTier" AS ENUM ('CORE_EARLY', 'LIGHT_LATE', 'UNSET');

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "tier" "SubjectTier" NOT NULL DEFAULT 'UNSET';

