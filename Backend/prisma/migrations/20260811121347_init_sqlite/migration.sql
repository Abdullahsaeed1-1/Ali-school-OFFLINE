-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timetableGenerationVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Campus_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "section" TEXT NOT NULL,
    "stream" TEXT,
    "campusId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "gamesProtectedLectures" TEXT NOT NULL DEFAULT '[]',
    "gamesProtectionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Class_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT true,
    "tier" TEXT NOT NULL DEFAULT 'UNSET',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClassSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodsPerWeek" INTEGER NOT NULL,
    "periodsPerDay" REAL,
    CONSTRAINT "ClassSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "maxPeriodsPerWeek" INTEGER NOT NULL DEFAULT 35,
    "targetPeriodsPerWeek" INTEGER NOT NULL DEFAULT 30,
    "currentPeriods" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hiringStatus" TEXT NOT NULL DEFAULT 'HIRED',
    "campusId" TEXT NOT NULL,
    "fcmToken" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Teacher_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "teacherId" TEXT,
    "refreshToken" TEXT,
    "lastPasswordSet" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "isGames" BOOLEAN NOT NULL DEFAULT false,
    "campusId" TEXT NOT NULL,
    "classGroup" TEXT NOT NULL,
    CONSTRAINT "Period_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academicYear" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT,
    "subjectId" TEXT,
    "periodId" TEXT NOT NULL,
    "secondTeacherId" TEXT,
    "isSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimetableEntry_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_secondTeacherId_fkey" FOREIGN KEY ("secondTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherLoadSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "totalAssigned" INTEGER NOT NULL,
    "totalTarget" INTEGER NOT NULL,
    "totalMax" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherLoadSummary_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubjectCoverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "requiredPeriods" INTEGER NOT NULL,
    "actualPeriods" INTEGER NOT NULL,
    "coverageDelta" INTEGER NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubjectCoverage_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubjectCoverage_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Class_name_campusId_key" ON "Class"("name", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSubject_classId_subjectId_key" ON "ClassSubject"("classId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_teacherId_key" ON "User"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubject_teacherId_subjectId_classId_key" ON "TeacherSubject"("teacherId", "subjectId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Period_periodNumber_campusId_classGroup_key" ON "Period"("periodNumber", "campusId", "classGroup");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_academicYear_dayOfWeek_classId_periodId_key" ON "TimetableEntry"("academicYear", "dayOfWeek", "classId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherLoadSummary_teacherId_academicYear_weekStart_key" ON "TeacherLoadSummary"("teacherId", "academicYear", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCoverage_classId_subjectId_academicYear_key" ON "SubjectCoverage"("classId", "subjectId", "academicYear");
