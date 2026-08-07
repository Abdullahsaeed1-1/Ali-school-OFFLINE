import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/constants/app_spacing.dart';
import '../../core/constants/subject_colors.dart';
import 'glass_card.dart';

/// A single row in the schedule list — a frosted glass card with a 4px left
/// border in the subject's color. [isPast] dims it to 40% opacity and drops
/// the colored border, per the design spec.
class PeriodCard extends StatelessWidget {
  const PeriodCard({
    super.key,
    required this.periodNumber,
    required this.timeLabel,
    required this.subjectName,
    required this.className,
    this.isPast = false,
  });

  final int periodNumber;
  final String timeLabel;
  final String? subjectName;
  final String className;
  final bool isPast;

  @override
  Widget build(BuildContext context) {
    final isFree = subjectName == null;
    final subjectColor = SubjectColors.forSubject(subjectName);

    return Opacity(
      opacity: isPast ? 0.4 : 1,
      child: GlassCard(
        blur: 8,
        fillOpacity: 0.07,
        borderOpacity: 0.1,
        borderRadius: 16,
        padding: EdgeInsets.zero,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!isPast)
                Container(width: 4, color: subjectColor)
              else
                const SizedBox(width: 4),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 14),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '$periodNumber',
                          style: GoogleFonts.inter(fontSize: 11, color: Colors.white.withValues(alpha: 0.75)),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      SizedBox(
                        width: 78,
                        child: Text(
                          timeLabel,
                          style: GoogleFonts.inter(fontSize: 12, color: Colors.white.withValues(alpha: 0.6)),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: isFree
                            ? Text(
                                'Free period',
                                style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
                              )
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    subjectName!,
                                    style: GoogleFonts.inter(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    className,
                                    style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.65)),
                                  ),
                                ],
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
