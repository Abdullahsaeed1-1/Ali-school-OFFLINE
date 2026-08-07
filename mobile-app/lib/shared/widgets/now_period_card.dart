import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/constants/subject_colors.dart';
import '../../core/utils/date_utils.dart';
import 'glass_card.dart';

/// The prominent "currently happening" card — the app's one design
/// signature. A vertical subjectColor→green gradient bar on the left pulses
/// (opacity 0.6 → 1.0, 2s loop), a soft diagonal shine sweeps across the
/// card every few seconds so the current lecture is unmistakable at a
/// glance, and the "ends in" countdown re-renders every minute via a
/// [Timer].
class NowPeriodCard extends StatefulWidget {
  const NowPeriodCard({
    super.key,
    required this.subjectName,
    required this.className,
    required this.campusName,
    required this.periodNumber,
    required this.endTime,
  });

  final String subjectName;
  final String className;
  final String campusName;
  final int periodNumber;

  /// Raw "HH:MM" end time — used to recompute the countdown every minute.
  final String endTime;

  @override
  State<NowPeriodCard> createState() => _NowPeriodCardState();
}

class _NowPeriodCardState extends State<NowPeriodCard> with TickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final AnimationController _shineController;
  Timer? _minuteTimer;
  bool _reduceMotion = false;

  @override
  void initState() {
    super.initState();
    _reduceMotion = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;

    _pulseController = AnimationController(vsync: this, duration: const Duration(seconds: 2));
    // A slow sweep (900ms) followed by a long pause (2100ms) — subtle, not a
    // constant glossy loop.
    _shineController = AnimationController(vsync: this, duration: const Duration(milliseconds: 3000));

    if (!_reduceMotion) {
      _pulseController.repeat(reverse: true);
      _shineController.repeat();
    }

    _minuteTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _shineController.dispose();
    _minuteTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final subjectColor = SubjectColors.forSubject(widget.subjectName);
    final minutesLeft = AppDateUtils.minutesUntil(widget.endTime, DateTime.now());

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Stack(
        children: [
          GlassCard(
            blur: 16,
            fillOpacity: 0.1,
            borderOpacity: 0.15,
            borderRadius: 20,
            padding: EdgeInsets.zero,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (context, _) => Opacity(
                      opacity: 0.6 + (0.4 * _pulseController.value),
                      child: Container(
                        width: 6,
                        margin: const EdgeInsets.symmetric(vertical: 2),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(3),
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [subjectColor, AppColors.accentGreen],
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'NOW',
                            style: GoogleFonts.inter(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: subjectColor,
                              letterSpacing: 2,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            widget.subjectName,
                            style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.className,
                            style: GoogleFonts.inter(fontSize: 14, color: Colors.white.withValues(alpha: 0.7)),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Row(
                            children: [
                              Icon(Icons.schedule_rounded, size: 12, color: AppColors.accentGreen.withValues(alpha: 0.9)),
                              const SizedBox(width: 4),
                              Text(
                                AppDateUtils.formatMinutesRemaining(minutesLeft),
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.accentGreen.withValues(alpha: 0.9),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Wrap(
                            spacing: AppSpacing.sm,
                            runSpacing: AppSpacing.xs,
                            children: [
                              _Pill(text: 'Period ${widget.periodNumber}'),
                              _Pill(text: widget.campusName),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (!_reduceMotion)
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: _shineController,
                  builder: (context, _) {
                    // Sweep across the first 30% of the cycle, then hold
                    // fully off-screen for the remaining 70% (the pause).
                    final t = Curves.easeInOut.transform(
                      (_shineController.value / 0.3).clamp(0.0, 1.0),
                    );
                    return LayoutBuilder(
                      builder: (context, constraints) {
                        final sweepWidth = constraints.maxWidth * 0.5;
                        final dx = -sweepWidth + (constraints.maxWidth + sweepWidth * 2) * t;
                        return Transform.translate(
                          offset: Offset(dx, 0),
                          child: Transform.rotate(
                            angle: -0.35,
                            child: Container(
                              width: sweepWidth,
                              height: constraints.maxHeight * 2,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.centerLeft,
                                  end: Alignment.centerRight,
                                  colors: [
                                    Colors.white.withValues(alpha: 0),
                                    Colors.white.withValues(alpha: 0.12),
                                    Colors.white.withValues(alpha: 0),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: GoogleFonts.inter(fontSize: 11, color: Colors.white.withValues(alpha: 0.85)),
      ),
    );
  }
}
