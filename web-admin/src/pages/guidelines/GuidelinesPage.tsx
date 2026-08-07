import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Gauge,
  Lock,
  MousePointerClick,
  Printer,
  Sparkles,
  Users,
} from 'lucide-react'
import Card from '../../components/ui/Card'

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sparkles
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <h3 className="font-display text-lg text-text-primary">{title}</h3>
      </div>
      <div className="space-y-2.5 text-sm leading-relaxed text-text-secondary">{children}</div>
    </Card>
  )
}

/**
 * Plain-language operational guidance for whoever runs this system day to
 * day — written for a future admin who wasn't part of building it, not for
 * a developer. Every point here came from something we actually learned
 * the hard way while building this (see PENDING_QUESTIONS.md for the full
 * technical trail behind each one).
 */
export default function GuidelinesPage() {
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="font-display text-2xl text-text-primary">Guidelines &amp; How to Use</h2>
        <p className="mt-1 text-sm text-text-muted">
          Practical things worth knowing that aren&apos;t obvious just from clicking around — written in plain
          language, not developer-speak.
        </p>
      </motion.div>

      <Section icon={Sparkles} title="Clicking &quot;Generate Timetable&quot; can reshuffle more than you'd expect">
        <p>
          Generate doesn&apos;t just fill in the gaps — it can rebuild a campus&apos;s <strong>entire</strong> schedule
          from scratch, even the parts that were already working fine. Two things can change between one Generate and
          the next, even if nothing about the school&apos;s actual requirements changed at all:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Which exact day and period a subject lands on for a class.</li>
          <li>
            For Girls and Boys campuses specifically, <strong>which teacher</strong> ends up covering a subject for a
            class can change too — not just the timing.
          </li>
        </ul>
        <p className="font-medium text-text-primary">
          Practical rule: only print or pin a teacher&apos;s schedule after the <strong>final</strong> Generate for
          that term. A schedule printed earlier can go out of date the next time anyone clicks Generate, even for a
          completely unrelated reason (like fixing one other class).
        </p>
      </Section>

      <Section icon={Lock} title="What &quot;Lock&quot; does and doesn't protect">
        <p>
          Locking a class (on the Timetable page) freezes its schedule completely — the next Generate will leave that
          class exactly as it is, no matter what else changes for the rest of the campus.
        </p>
        <p>
          The system also correctly accounts for a teacher&apos;s time already spent on a locked class, so locking
          won&apos;t cause that teacher to accidentally get overloaded elsewhere on the next Generate.
        </p>
        <p>
          <strong>What it doesn&apos;t do:</strong> Lock only protects that one class. It doesn&apos;t protect a
          specific teacher&apos;s schedule across other classes, and it doesn&apos;t stop the Games duty rotation from
          changing for everyone else.
        </p>
        <p className="font-medium text-text-primary">
          Use it once you&apos;re happy with a specific class&apos;s schedule and don&apos;t want it disturbed by a
          later Generate for the rest of the campus.
        </p>
      </Section>

      <Section icon={Users} title="What the &quot;VACANT&quot; / &quot;To Be Hired&quot; badge means">
        <p>
          Some names in this system (like &quot;Miss TBH&quot; or &quot;Sir TBH2&quot;) are <strong>placeholders</strong>{' '}
          for a position the school hasn&apos;t hired someone for yet — not a real person. Anywhere you see the amber
          &quot;VACANT&quot; badge or a warning triangle next to a name, that period has{' '}
          <strong>no one actually covering it in real life</strong>, even though the schedule shows a name there.
        </p>
        <p>Once the school hires someone for that position, update the teacher's record with their real name and details, then Generate again.</p>
      </Section>

      <Section icon={Gauge} title="A teacher's weekly Target is a ceiling, not a goal that's always reached">
        <p>
          <strong>Target periods/week</strong> is the most a teacher will ever be scheduled for — the system will
          never assign a teacher more periods than their target, whether that's from the normal timetable or from
          Games duty.
        </p>
        <p>
          If a teacher consistently shows <strong>fewer</strong> periods than their target, that&apos;s usually not a
          software problem — it means the subjects and classes currently assigned to them don&apos;t add up to enough
          periods to fill their full week. This needs a person to look at their assignments (see Capacity Advisor
          below), not something Generate can fix by itself.
        </p>
      </Section>

      <Section icon={AlertTriangle} title="Warnings page vs. Capacity Advisor page — different jobs">
        <p>
          <strong>Warnings</strong> lists problems: hiring gaps, subjects with no eligible teacher, understaffed Games
          duty slots. It tells you what&apos;s wrong.
        </p>
        <p>
          <strong>Capacity Advisor</strong> is different — it looks specifically at teachers below their weekly
          target and suggests real fixes using their existing subjects. It never changes anything by itself; every
          suggestion needs an explicit click to confirm, and shows the effect before you confirm it. A{' '}
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-xs font-medium text-[#166534]">
            <ArrowRightLeft className="h-3 w-3" /> Safe Fill
          </span>{' '}
          is pure gain and affects no one else; a{' '}
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            <ArrowRightLeft className="h-3 w-3" /> Reassignment
          </span>{' '}
          moves a subject/class pair away from another teacher, so it always shows what that other teacher loses
          before you confirm.
        </p>
      </Section>

      <Section icon={MousePointerClick} title="Fixing one period without a full regenerate">
        <p>
          On the Timetable page, click directly on any period in a class&apos;s grid to edit just that one period —
          change the subject, change the teacher, or clear it entirely — without touching anything else in the
          schedule. Useful for a one-off fix or a last-minute substitute, instead of risking a full Generate
          reshuffling everything (see the first point above).
        </p>
        <p>Two different checks happen when you save a change:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Blocked, no way around it:</strong> the teacher you picked is already teaching (or on Games duty)
            somewhere else at that exact same time. A person genuinely can&apos;t be in two places at once, so this
            can&apos;t be overridden.
          </li>
          <li>
            <strong>Warning, but you can proceed:</strong> the teacher you picked doesn&apos;t normally teach that
            subject for that class. This is allowed on purpose — the most common reason to use this feature at all is
            a short-notice substitute who genuinely isn&apos;t the usual teacher. You&apos;ll be asked to confirm
            before it's saved.
          </li>
        </ul>
      </Section>

      <Section icon={Calendar} title="Games duty (Girls &amp; Boys campuses) — 2 teachers per period, not 2 per class">
        <p>
          During a Games period, 2 teachers supervise the <strong>whole playground</strong> at once — not 2 teachers
          per class. If 4 classes all have Games at the same time, it&apos;s still only 2 teachers watching everyone
          together, never more. (Junior campus is different — each class&apos;s own regular teacher takes them for
          Games as part of their normal day, so this doesn&apos;t apply there.)
        </p>
      </Section>

      <Section icon={Printer} title="Every campus is generated separately">
        <p>
          Junior, Girls, and Boys are entirely independent schedules. Generating a timetable for one campus never
          touches the other two — you can safely regenerate Boys without affecting anything already set for Girls or
          Junior.
        </p>
      </Section>
    </div>
  )
}
