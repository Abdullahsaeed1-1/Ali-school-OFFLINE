/**
 * seed.ts — Ali Public School real reference data
 *
 * Source of truth: APS_Timetable_Master_Spec.md (final, school-confirmed
 * version, 2026-07-25) — §2 section counts, §5/§5b/§5c subject quotas,
 * §6/§6b teacher rosters, §3 period structure. As of this version, every
 * campus (Junior/Girls/Boys) has fully confirmed quotas and rosters —
 * PENDING_QUESTIONS.md items 3-5 are resolved.
 *
 * THIS SCRIPT WIPES existing Class/Teacher data (and everything that hangs
 * off them — ClassSubject, TeacherSubject, TimetableEntry, load summaries,
 * subject coverage, teacher login accounts) before reseeding. It is NOT
 * safe to re-run against data you want to keep — it exists to replace the
 * placeholder/test data (57 teachers, 52 classes, fake entries like
 * "ahmad") with the school's real, confirmed structure.
 *
 * What is intentionally NOT seeded here (per CLAUDE.md's ground-truth rule
 * — never invent a number):
 *   - "11 CS" (confirmed future-planning placeholder, not an active class).
 *   - Class 1C, Class 3B, Class 3C (Excel had quota data for these, but the
 *     school confirmed they are stale leftover rows, not real sections).
 *
 * npm run db:seed   (from Backend/)
 */

const { PrismaClient } = (await import('@prisma/client')) as any

const CampusType = { JUNIOR: 'JUNIOR', GIRLS: 'GIRLS', BOYS: 'BOYS' } as const
const HiringStatus = { HIRED: 'HIRED', TO_BE_HIRED: 'TO_BE_HIRED' } as const

const prisma = new PrismaClient()

type Eligibility = { subject: string; classes: string[] }
type TeacherSeed = { name: string; hiringStatus: 'HIRED' | 'TO_BE_HIRED'; eligibilities: Eligibility[] }

async function main() {
  console.log('Wiping placeholder Class/Teacher data...')

  await prisma.$transaction(async (tx: any) => {
    await tx.timetableEntry.deleteMany({})
    await tx.teacherLoadSummary.deleteMany({})
    await tx.subjectCoverage.deleteMany({})
    await tx.classSubject.deleteMany({})
    await tx.teacherSubject.deleteMany({})
    // Only remove login accounts linked to a Teacher row — never touch
    // ADMIN accounts (User.teacherId is null for those).
    await tx.user.deleteMany({ where: { teacherId: { not: null } } })
    await tx.teacher.deleteMany({})
    await tx.class.deleteMany({})
    await tx.period.deleteMany({})
  })

  console.log('Seeding real Ali Public School data...')

  // ── SCHOOL & CAMPUSES ──────────────────────────────────────────────────
  const school = await prisma.school.upsert({
    where: { id: 'seed-school' },
    update: {},
    create: { id: 'seed-school', name: 'Ali Public School', address: 'Main Campus' },
  })

  const junior = await prisma.campus.upsert({
    where: { id: 'seed-campus-junior' },
    update: {},
    create: { id: 'seed-campus-junior', name: 'Junior Campus', type: CampusType.JUNIOR, schoolId: school.id },
  })
  const girls = await prisma.campus.upsert({
    where: { id: 'seed-campus-girls' },
    update: {},
    create: { id: 'seed-campus-girls', name: 'Girls Campus', type: CampusType.GIRLS, schoolId: school.id },
  })
  const boys = await prisma.campus.upsert({
    where: { id: 'seed-campus-boys' },
    update: {},
    create: { id: 'seed-campus-boys', name: 'Boys Campus', type: CampusType.BOYS, schoolId: school.id },
  })

  // ── SUBJECTS ────────────────────────────────────────────────────────────
  // tier is per §8's confirmed final tier table.
  const CORE_EARLY = 'CORE_EARLY'
  const LIGHT_LATE = 'LIGHT_LATE'
  const UNSET = 'UNSET'
  const subjectsData = [
    { name: 'English', code: 'ENG', isCore: true, tier: CORE_EARLY },
    { name: 'Urdu', code: 'URD', isCore: true, tier: LIGHT_LATE },
    { name: 'Maths', code: 'MAT', isCore: true, tier: CORE_EARLY },
    { name: 'Science', code: 'SCI', isCore: true, tier: CORE_EARLY },
    { name: 'Islamiat', code: 'ISL', isCore: true, tier: LIGHT_LATE },
    { name: 'Geography/SS', code: 'GEO', isCore: true, tier: LIGHT_LATE },
    // Classes 8-10 use this subject, not Geography/SS — confirmed §5:
    // the Excel's "Geography/SS" label for those classes is a leftover
    // template artifact, the real subject taught is Pak Study. Applies to
    // both Girls and Boys campuses.
    { name: 'Pak Study', code: 'PAK', isCore: true, tier: LIGHT_LATE },
    { name: 'Computer Science', code: 'CS', isCore: false, tier: LIGHT_LATE },
    // ✅ Confirmed §8 (2026-07-25): same tier as Geography/SS. Optional
    // slot-sharing with Geography/SS on alternating days is a nice-to-have
    // the school suggested, not implemented — not required per the spec.
    { name: 'History', code: 'HIS', isCore: false, tier: LIGHT_LATE },
    { name: 'Physics', code: 'PHY', isCore: false, tier: CORE_EARLY },
    { name: 'Chemistry', code: 'CHE', isCore: false, tier: CORE_EARLY },
    { name: 'Biology', code: 'BIO', isCore: false, tier: CORE_EARLY },
    { name: 'Reading/Writing', code: 'RW', isCore: true, tier: LIGHT_LATE },
    // Games has its own rule (§8/§17), not a plain tier or a normal
    // TeacherSubject eligibility model — see the rotation-duty scheduler.
    // LIGHT_LATE here is just the Group-B/fallback baseline; Group A's
    // fixed-Period-4 preference is special-cased by subject name.
    { name: 'Games', code: 'GAM', isCore: true, tier: LIGHT_LATE },
    // ✅ Tiered 2026-07-26 (Abdullah, extrapolating the school's general
    // Junior guidance — "focus on major subjects like English/Science/Maths
    // earlier in the day" — rather than a subject-by-subject school
    // confirmation): none of these are the named "major subjects", and each
    // has a closest already-confirmed analog that's LIGHT_LATE (generic
    // Reading/Writing, Urdu, Islamiat) — so all follow the same tier.
    { name: 'Activity', code: 'ACT', isCore: true, tier: LIGHT_LATE },
    { name: 'Diary', code: 'DIA', isCore: true, tier: LIGHT_LATE },
    { name: 'Arabic', code: 'ARB', isCore: false, tier: UNSET },
    { name: 'WRA', code: 'WRA', isCore: true, tier: LIGHT_LATE },
    // Junior-only (§5c) — distinct, explicitly-labeled compound subjects in
    // the confirmed quota table, not the same as generic Reading/Writing or
    // Islamiat. §8's tier table never named these Junior-specific compounds
    // directly, so this follows the same 2026-07-26 extrapolation as above.
    { name: 'English Reading/Writing', code: 'ERW', isCore: true, tier: LIGHT_LATE },
    { name: 'Urdu Reading/Writing', code: 'URW', isCore: true, tier: LIGHT_LATE },
    { name: 'Islamiat/GK', code: 'IGK', isCore: true, tier: LIGHT_LATE },
  ]
  for (const s of subjectsData) {
    await prisma.subject.upsert({ where: { name: s.name }, update: { ...s }, create: { ...s } })
  }
  const subjects = await prisma.subject.findMany()
  const subjectByName = new Map<string, any>(subjects.map((s: any) => [s.name, s]))

  // One-time backfill of Class.gamesProtectedLectures for freshly-seeded
  // data — mirrors the real, already-confirmed values the old
  // gradeLevel-inference functions (school.ts's gamesGroupForClass /
  // juniorGamesHardSlots, removed in item 30) used to compute at runtime:
  // Girls/Boys grades 1-7 and "11 Medical" reserve period 4 (§8 Group A),
  // grades 8-10 need no protection (§8 Group B), Junior's Pre
  // Nursery/Nursery/KG use the school's confirmed answer (§14, item 14).
  // Seed-only — nothing at runtime infers this anymore; every class now
  // carries its own explicit, confirmed answer (set via the Add/Edit Class
  // UI going forward), this just seeds these known-historical rows
  // correctly instead of leaving them at the schema default.
  function gamesProtectionFor(name: string, gradeLevel: string | null): number[] {
    if (name === '11 Medical') return [4]
    const grade = Number.parseInt(gradeLevel ?? '', 10)
    if (Number.isFinite(grade) && grade >= 1 && grade <= 7) return [4]
    if (Number.isFinite(grade) && grade >= 8 && grade <= 10) return []
    const juniorGrade = gradeLevel?.trim().toLowerCase()
    if (juniorGrade === 'pre nursery') return [3, 7]
    if (juniorGrade === 'nursery') return [4]
    if (juniorGrade === 'kg') return [5]
    return []
  }

  // ── JUNIOR CLASSES (8, confirmed §2) ───────────────────────────────────
  // No confirmed Junior subject quotas or teacher roster exist yet — these
  // classes are seeded as structure only, per the ground-truth rule.
  const juniorClassDefs = [
    { name: 'Pre Nursery A', gradeLevel: 'Pre Nursery', section: 'A' },
    { name: 'Pre Nursery B', gradeLevel: 'Pre Nursery', section: 'B' },
    { name: 'Nursery A', gradeLevel: 'Nursery', section: 'A' },
    { name: 'Nursery B', gradeLevel: 'Nursery', section: 'B' },
    { name: 'Nursery C', gradeLevel: 'Nursery', section: 'C' },
    { name: 'KG A', gradeLevel: 'KG', section: 'A' },
    { name: 'KG B', gradeLevel: 'KG', section: 'B' },
    { name: 'KG C', gradeLevel: 'KG', section: 'C' },
  ]
  for (const c of juniorClassDefs) {
    await prisma.class.create({
      data: {
        ...c,
        stream: 'JUNIOR',
        campusId: junior.id,
        gamesProtectedLectures: JSON.stringify(gamesProtectionFor(c.name, c.gradeLevel)),
        gamesProtectionConfirmed: true,
      },
    })
  }

  // ── GIRLS CLASSES (14, confirmed §2 — excludes 1C, 3B, 3C, 11 CS) ──────
  const girlsClassDefs = [
    { name: '1A', gradeLevel: '1', section: 'A' },
    { name: '1B', gradeLevel: '1', section: 'B' },
    { name: '2A', gradeLevel: '2', section: 'A' },
    { name: '2B', gradeLevel: '2', section: 'B' },
    { name: '2C', gradeLevel: '2', section: 'C' },
    { name: '3A', gradeLevel: '3', section: 'A' },
    { name: '4A', gradeLevel: '4', section: 'A' },
    { name: '5A', gradeLevel: '5', section: 'A' },
    { name: '6A', gradeLevel: '6', section: 'A' },
    { name: '7A', gradeLevel: '7', section: 'A' },
    { name: '8A', gradeLevel: '8', section: 'A' },
    { name: '9A', gradeLevel: '9', section: 'A' },
    { name: '10A', gradeLevel: '10', section: 'A' },
    { name: '11 Medical', gradeLevel: '11', section: 'Medical', stream: 'MEDICAL' },
  ]
  for (const c of girlsClassDefs) {
    await prisma.class.create({
      data: {
        ...c,
        campusId: girls.id,
        gamesProtectedLectures: JSON.stringify(gamesProtectionFor(c.name, c.gradeLevel)),
        gamesProtectionConfirmed: true,
      },
    })
  }
  const girlsClasses = await prisma.class.findMany({ where: { campusId: girls.id } })
  const girlsClassByName = new Map<string, any>(girlsClasses.map((c: any) => [c.name, c]))

  // ── BOYS CLASSES (11, confirmed §2) ────────────────────────────────────
  const boysClassDefs = [
    { name: '3A', gradeLevel: '3', section: 'A' },
    { name: '4A', gradeLevel: '4', section: 'A' },
    { name: '4B', gradeLevel: '4', section: 'B' },
    { name: '5A', gradeLevel: '5', section: 'A' },
    { name: '5B', gradeLevel: '5', section: 'B' },
    { name: '6A', gradeLevel: '6', section: 'A' },
    { name: '6B', gradeLevel: '6', section: 'B' },
    { name: '7A', gradeLevel: '7', section: 'A' },
    { name: '8A', gradeLevel: '8', section: 'A' },
    { name: '9A', gradeLevel: '9', section: 'A' },
    { name: '10A', gradeLevel: '10', section: 'A' },
  ]
  for (const c of boysClassDefs) {
    await prisma.class.create({
      data: {
        ...c,
        campusId: boys.id,
        gamesProtectedLectures: JSON.stringify(gamesProtectionFor(c.name, c.gradeLevel)),
        gamesProtectionConfirmed: true,
      },
    })
  }
  const boysClasses = await prisma.class.findMany({ where: { campusId: boys.id } })
  const boysClassByName = new Map<string, any>(boysClasses.map((c: any) => [c.name, c]))

  // ── GIRLS CLASS-SUBJECT QUOTAS (confirmed §5, Games added per v1 finding
  //    of 5/wk for 1-7, 3/wk for 8, 1/wk for 9-10, 5/wk confirmed for 11
  //    Medical in §14) ──────────────────────────────────────────────────
  const primaryQuota = [
    ['English', 5], ['Urdu', 5], ['Islamiat', 5], ['Maths', 5], ['Science', 5],
    ['Geography/SS', 2], ['Reading/Writing', 3], ['Games', 5],
  ] as const

  const girlsQuotas: Record<string, ReadonlyArray<readonly [string, number]>> = {
    '1A': primaryQuota, '1B': primaryQuota,
    '2A': primaryQuota, '2B': primaryQuota, '2C': primaryQuota,
    '3A': primaryQuota,
    '4A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 2], ['Computer Science', 3], ['Reading/Writing', 3], ['Games', 5],
    ],
    '5A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 5], ['Computer Science', 3], ['Games', 5],
    ],
    '6A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 3], ['Computer Science', 3], ['History', 2], ['Games', 5],
    ],
    '7A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 3], ['Computer Science', 3], ['History', 2], ['Games', 5],
    ],
    '8A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Physics', 4],
      ['Chemistry', 4], ['Biology', 4], ['Pak Study', 3], ['Games', 3],
    ],
    '9A': [
      ['English', 5], ['Urdu', 3], ['Islamiat', 3], ['Maths', 5], ['Physics', 5],
      ['Chemistry', 5], ['Biology', 5], ['Pak Study', 3], ['Games', 1],
    ],
    '10A': [
      ['English', 5], ['Urdu', 3], ['Islamiat', 3], ['Maths', 5], ['Physics', 5],
      ['Chemistry', 5], ['Biology', 5], ['Pak Study', 3], ['Games', 1],
    ],
    '11 Medical': [
      ['English', 5], ['Urdu', 5], ['Islamiat', 5], ['Physics', 5],
      ['Chemistry', 5], ['Biology', 5], ['Games', 5],
    ],
  }

  async function seedClassSubjects(quotas: Record<string, ReadonlyArray<readonly [string, number]>>, classByName: Map<string, any>) {
    for (const [className, quota] of Object.entries(quotas)) {
      const cls = classByName.get(className) as any
      for (const [subjectName, periodsPerWeek] of quota) {
        const subject = subjectByName.get(subjectName) as any
        if (!subject) {
          console.warn(`[seed] subject "${subjectName}" not found — skipping quota row for ${className}`)
          continue
        }
        await prisma.classSubject.create({
          data: { classId: cls.id, subjectId: subject.id, periodsPerWeek, periodsPerDay: periodsPerWeek / 5 },
        })
      }
    }
  }

  await seedClassSubjects(girlsQuotas, girlsClassByName)

  // ── BOYS CLASS-SUBJECT QUOTAS (confirmed §5b — identical structure to
  //    Girls, extracted directly from `Boys Timetable 2023-24`) ──────────
  const boysQuotas: Record<string, ReadonlyArray<readonly [string, number]>> = {
    '3A': [
      ['English', 5], ['Urdu', 5], ['Islamiat', 5], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 2], ['Reading/Writing', 3], ['Games', 5],
    ],
    '4A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 2], ['Computer Science', 3], ['Reading/Writing', 3], ['Games', 5],
    ],
    '4B': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 2], ['Computer Science', 3], ['Reading/Writing', 3], ['Games', 5],
    ],
    '5A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 5], ['Computer Science', 3], ['Games', 5],
    ],
    '5B': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 5], ['Computer Science', 3], ['Games', 5],
    ],
    '6A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 3], ['Computer Science', 3], ['History', 2], ['Games', 5],
    ],
    '6B': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 3], ['Computer Science', 3], ['History', 2], ['Games', 5],
    ],
    '7A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Science', 5],
      ['Geography/SS', 3], ['Computer Science', 3], ['History', 2], ['Games', 5],
    ],
    '8A': [
      ['English', 5], ['Urdu', 4], ['Islamiat', 3], ['Maths', 5], ['Physics', 4],
      ['Chemistry', 4], ['Biology', 4], ['Pak Study', 3], ['Games', 3],
    ],
    '9A': [
      ['English', 5], ['Urdu', 3], ['Islamiat', 3], ['Maths', 5], ['Physics', 5],
      ['Chemistry', 5], ['Biology', 5], ['Pak Study', 3], ['Games', 1],
    ],
    '10A': [
      ['English', 5], ['Urdu', 3], ['Islamiat', 3], ['Maths', 5], ['Physics', 5],
      ['Chemistry', 5], ['Biology', 5], ['Pak Study', 3], ['Games', 1],
    ],
  }
  await seedClassSubjects(boysQuotas, boysClassByName)

  // ── JUNIOR CLASS-SUBJECT QUOTAS (confirmed §5c, extracted directly from
  //    `Junior Timetable 2026_27`) ─────────────────────────────────────────
  const juniorClasses = await prisma.class.findMany({ where: { campusId: junior.id } })
  const juniorClassByName = new Map<string, any>(juniorClasses.map((c: any) => [c.name, c]))

  const preNurseryQuota = [
    ['English', 5], ['Maths', 5], ['Urdu', 5], ['Games', 10], ['Activity', 5], ['Diary', 5],
  ] as const
  const nurseryQuota = [
    ['English', 4], ['Maths', 5], ['Urdu', 4], ['Games', 5], ['English Reading/Writing', 3],
    ['Diary', 5], ['Islamiat/GK', 5], ['Urdu Reading/Writing', 2], ['WRA', 2],
  ] as const
  const kgQuota = [
    ['English', 4], ['Urdu', 4], ['Maths', 5], ['Diary', 5], ['Games', 5],
    ['English Reading/Writing', 3], ['Islamiat/GK', 5], ['Urdu Reading/Writing', 2], ['WRA', 2],
  ] as const

  const juniorQuotas: Record<string, ReadonlyArray<readonly [string, number]>> = {
    'Pre Nursery A': preNurseryQuota, 'Pre Nursery B': preNurseryQuota,
    'Nursery A': nurseryQuota, 'Nursery B': nurseryQuota, 'Nursery C': nurseryQuota,
    'KG A': kgQuota, 'KG B': kgQuota, 'KG C': kgQuota,
  }
  await seedClassSubjects(juniorQuotas, juniorClassByName)

  // ── TEACHER ROSTER (confirmed §6) ──────────────────────────────────────
  // Eligibility is (teacher, subject, class) triples, not a subject list
  // crossed with a class list — most teachers here teach different
  // subjects to different specific classes, and a cross-product would
  // silently grant eligibility they don't actually have.
  //
  // Note: §5 confirms Classes 8-10 use "Pak Study" where the roster below
  // (typed before that rename) still says "Geography/SS" — those specific
  // class entries are seeded as Pak Study so eligibility lines up with the
  // real quota subject.

  const girlsTeachers: TeacherSeed[] = [
    { name: 'Miss Mehreen', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Urdu', classes: ['4A', '5A', '6A', '7A', '8A', '9A', '10A'] },
    ] },
    { name: 'Miss Sania', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Maths', classes: ['5A', '6A', '7A', '8A', '9A', '10A'] },
    ] },
    { name: 'Miss Laila', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Science', classes: ['1A', '1B', '2A', '2B', '2C', '3A'] },
    ] },
    { name: 'Miss Hira', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'History', classes: ['5A', '6A', '7A', '8A', '9A', '10A'] },
      { subject: 'Geography/SS', classes: ['5A', '6A', '7A'] },
      { subject: 'Pak Study', classes: ['8A', '9A', '10A'] },
    ] },
    { name: 'Miss Saima Afridi', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Geography/SS', classes: ['1A', '1B', '2B', '2C'] },
      { subject: 'Reading/Writing', classes: ['1A', '1B', '2B', '2C'] },
      { subject: 'Chemistry', classes: ['8A', '9A'] },
    ] },
    { name: 'Miss Haleema', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Islamiat', classes: ['5A', '6A', '7A', '8A', '9A', '10A', '11 Medical'] },
    ] },
    { name: 'Miss Mehak', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Maths', classes: ['1B', '2A', '2B', '2C', '3A', '4A'] },
    ] },
    { name: 'Miss Komal', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Islamiat', classes: ['1A', '1B', '2A', '2B', '2C', '3A'] },
    ] },
    { name: 'Miss Akasha', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Urdu', classes: ['1A', '1B', '2A', '2B', '2C', '3A'] },
    ] },
    { name: 'Miss Adeena', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'English', classes: ['1A', '1B', '2A', '2B', '2C', '3A'] },
    ] },
    { name: 'Miss Kashaf', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Biology', classes: ['8A', '9A', '10A'] },
      { subject: 'Science', classes: ['5A', '6A', '7A'] },
    ] },
    { name: 'Miss Shandana', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Computer Science', classes: ['4A', '5A', '6A', '7A'] },
      { subject: 'Maths', classes: ['1A'] },
      { subject: 'Geography/SS', classes: ['2A'] },
      { subject: 'Reading/Writing', classes: ['2A'] },
    ] },
    { name: 'Miss TBH', hiringStatus: HiringStatus.TO_BE_HIRED, eligibilities: [
      { subject: 'English', classes: ['7A', '8A', '9A', '10A', '11 Medical'] },
      { subject: 'Urdu', classes: ['11 Medical'] },
    ] },
    { name: 'Miss TBH1', hiringStatus: HiringStatus.TO_BE_HIRED, eligibilities: [
      { subject: 'English', classes: ['4A', '5A', '6A'] },
      { subject: 'Geography/SS', classes: ['3A', '4A'] },
      { subject: 'Reading/Writing', classes: ['3A', '4A'] },
      { subject: 'Islamiat', classes: ['4A'] },
    ] },
    { name: 'Miss TBH2', hiringStatus: HiringStatus.TO_BE_HIRED, eligibilities: [
      { subject: 'Physics', classes: ['8A', '9A', '10A', '11 Medical'] },
      { subject: 'Chemistry', classes: ['10A'] },
      { subject: 'Science', classes: ['4A'] },
    ] },
    { name: 'Miss TBH3', hiringStatus: HiringStatus.TO_BE_HIRED, eligibilities: [
      { subject: 'Biology', classes: ['11 Medical'] },
      { subject: 'Chemistry', classes: ['11 Medical'] },
    ] },
  ]

  const boysTeachers: TeacherSeed[] = [
    { name: 'Sir Siyar', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Maths', classes: ['6A', '6B', '7A', '8A', '9A', '10A'] },
    ] },
    { name: 'Sir Aadil', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Chemistry', classes: ['8A', '9A', '10A'] },
      { subject: 'Biology', classes: ['8A', '9A', '10A'] },
    ] },
    { name: 'Sir Shabir', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Urdu', classes: ['6A', '6B', '7A', '8A', '9A', '10A'] },
    ] },
    { name: 'Sir Mursaleen', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Islamiat', classes: ['3A', '5B', '6A', '6B', '7A', '8A', '9A', '10A'] },
    ] },
    { name: 'Sir Touseef', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Geography/SS', classes: ['4A', '4B', '6A', '6B', '7A'] },
      { subject: 'Pak Study', classes: ['8A'] },
      { subject: 'History', classes: ['4A', '4B', '6A', '6B', '7A', '8A'] },
      { subject: 'Reading/Writing', classes: ['4A', '4B', '6A', '6B', '7A', '8A'] },
    ] },
    { name: 'Sir Haroon', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'English', classes: ['4A', '4B', '5A', '5B', '6A', '6B'] },
    ] },
    { name: 'Sir Nooristan', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Urdu', classes: ['3A', '4A', '4B', '5A', '5B'] },
    ] },
    { name: 'Sir Ishfaq', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Maths', classes: ['3A', '4A', '4B', '5A', '5B'] },
      { subject: 'Islamiat', classes: ['5A'] },
    ] },
    { name: 'Sir Sajjad', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Physics', classes: ['8A', '9A', '10A'] },
      { subject: 'Science', classes: ['6B', '7A'] },
    ] },
    { name: 'Sir Salman', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Science', classes: ['3A', '4A', '4B', '5A', '5B', '6A'] },
    ] },
    { name: 'Sir Shahid', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'Computer Science', classes: ['4A', '4B', '5A', '5B', '6A', '6B', '7A'] },
    ] },
    { name: 'Sir Akram', hiringStatus: HiringStatus.HIRED, eligibilities: [
      { subject: 'English', classes: ['3A', '7A', '8A', '9A', '10A'] },
      { subject: 'Islamiat', classes: ['4A', '4B'] },
    ] },
    { name: 'Sir TBH', hiringStatus: HiringStatus.TO_BE_HIRED, eligibilities: [
      { subject: 'Geography/SS', classes: ['3A', '5A', '5B'] },
      { subject: 'Pak Study', classes: ['9A', '10A'] },
      { subject: 'Reading/Writing', classes: ['3A', '5A', '5B', '9A', '10A'] },
    ] },
  ]
  // ── JUNIOR TEACHER ROSTER (confirmed §6b — whole-class homeroom model,
  //    not subject-specialist) ────────────────────────────────────────────
  // Unlike Girls/Boys, each Junior teacher teaches every subject to their
  // one assigned section, so eligibility is auto-generated below from that
  // section's own quota (§5c) rather than typed out subject-by-subject.
  //
  // ✅ Confirmed §18 item 9 (2026-07-25): targetPeriodsPerWeek=35 for
  // Junior, passed to seedTeachers() below — their homeroom role already
  // includes Games within their own section's teaching (unlike Girls/Boys,
  // where Games is separate rotation duty on top of the 30/week academic
  // target), so 35 is their real full load, not an inflated number.
  const juniorRoster: Array<{ name: string; section: string; hiringStatus: 'HIRED' | 'TO_BE_HIRED' }> = [
    { name: 'Miss Nimra', section: 'Pre Nursery A', hiringStatus: HiringStatus.HIRED },
    { name: 'Miss Sumaira Nadeem', section: 'Pre Nursery B', hiringStatus: HiringStatus.HIRED },
    { name: 'Miss Sapna', section: 'Nursery A', hiringStatus: HiringStatus.HIRED },
    { name: 'Miss Shukria', section: 'Nursery B', hiringStatus: HiringStatus.HIRED },
    { name: 'Miss TBH', section: 'Nursery C', hiringStatus: HiringStatus.TO_BE_HIRED },
    { name: 'Miss Sumaira Shahid', section: 'KG A', hiringStatus: HiringStatus.HIRED },
    { name: 'Miss Shazia', section: 'KG B', hiringStatus: HiringStatus.HIRED },
    { name: 'Miss Maimoona', section: 'KG C', hiringStatus: HiringStatus.HIRED },
  ]

  const juniorTeachers: TeacherSeed[] = juniorRoster.map((entry) => ({
    name: entry.name,
    hiringStatus: entry.hiringStatus,
    eligibilities: (juniorQuotas[entry.section] ?? []).map(([subject]) => ({ subject, classes: [entry.section] })),
  }))

  async function seedTeachers(
    list: TeacherSeed[],
    campusId: string,
    classByName: Map<string, any>,
    targetPeriodsPerWeek = 30,
  ) {
    for (const t of list) {
      const teacher = await prisma.teacher.create({
        data: {
          name: t.name,
          campusId,
          hiringStatus: t.hiringStatus,
          targetPeriodsPerWeek,
          maxPeriodsPerWeek: 35,
          currentPeriods: 0,
        },
      })

      const rows: Array<{ teacherId: string; subjectId: string; classId: string; isPrimary: boolean }> = []
      for (const elig of t.eligibilities) {
        const subject = subjectByName.get(elig.subject) as any
        if (!subject) {
          console.warn(`[seed] subject "${elig.subject}" not found — skipping for ${t.name}`)
          continue
        }
        for (const className of elig.classes) {
          const cls = classByName.get(className) as any
          if (!cls) {
            console.warn(`[seed] class "${className}" not found — skipping ${elig.subject} for ${t.name}`)
            continue
          }
          rows.push({ teacherId: teacher.id, subjectId: subject.id, classId: cls.id, isPrimary: true })
        }
      }
      if (rows.length) {
        await prisma.teacherSubject.createMany({ data: rows })
      }
    }
  }

  await seedTeachers(girlsTeachers, girls.id, girlsClassByName)
  await seedTeachers(boysTeachers, boys.id, boysClassByName)
  // ✅ Confirmed §18 item 9 (2026-07-25): Junior homeroom teachers target
  // 35/week, not the general 30 — their role already includes Games within
  // their own section's teaching, unlike Girls/Boys where Games is a
  // separate rotation duty on top of the 30.
  await seedTeachers(juniorTeachers, junior.id, juniorClassByName, 35)

  // ── PERIODS (confirmed §3 — uniform for every campus/level, no
  //    exceptions; the only variation is Mon-Thu vs Friday duration) ─────
  // Start-of-day anchor (08:00) is a placeholder for display purposes only
  // — the school confirmed period/break DURATIONS, not an actual bell
  // time. Adjust the anchor if/when the school specifies one.
  function buildDayPeriods(periodMinutes: number, breakMinutes: number, campusId: string, classGroup: 'MON_THU' | 'FRIDAY') {
    const rows: any[] = []
    let cursor = 8 * 60 // 08:00 in minutes
    const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

    let periodNumber = 1
    for (let lecture = 1; lecture <= 7; lecture++) {
      if (lecture === 5) {
        rows.push({
          periodNumber, name: 'Break', startTime: fmt(cursor), endTime: fmt(cursor + breakMinutes),
          duration: breakMinutes, isBreak: true, classGroup, campusId,
        })
        cursor += breakMinutes
        periodNumber += 1
      }
      rows.push({
        periodNumber, name: `Period ${lecture}`, startTime: fmt(cursor), endTime: fmt(cursor + periodMinutes),
        duration: periodMinutes, isBreak: false, classGroup, campusId,
      })
      cursor += periodMinutes
      periodNumber += 1
    }
    return rows
  }

  const periodRows: any[] = []
  for (const campus of [junior, girls, boys]) {
    periodRows.push(...buildDayPeriods(40, 20, campus.id, 'MON_THU'))
    periodRows.push(...buildDayPeriods(35, 20, campus.id, 'FRIDAY'))
  }
  await prisma.period.createMany({ data: periodRows })

  console.log('Seed complete.')
  console.log(`Junior: ${juniorClassDefs.length} classes, ${juniorTeachers.length} teachers`)
  console.log(`Girls: ${girlsClassDefs.length} classes, ${girlsTeachers.length} teachers`)
  console.log(`Boys: ${boysClassDefs.length} classes, ${boysTeachers.length} teachers`)
}

try {
  await main()
} catch (error) {
  console.error(error)
  throw error
} finally {
  await prisma.$disconnect()
}
