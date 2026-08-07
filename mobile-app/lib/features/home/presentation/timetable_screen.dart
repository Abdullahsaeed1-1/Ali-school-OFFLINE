import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/subject_colors.dart';
import '../../../core/network/network_error.dart';
import '../../../core/utils/date_utils.dart';
import '../../../shared/widgets/building_background.dart';
import '../../../shared/widgets/glass_card.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../../shared/widgets/period_card.dart';
import '../../../shared/widgets/shimmer_loader.dart';
import '../data/home_providers.dart';
import '../data/models/timetable_entry.dart';

const _weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const _dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/// Full weekly schedule — a day selector plus that day's periods.
class TimetableScreen extends ConsumerStatefulWidget {
  const TimetableScreen({super.key});

  @override
  ConsumerState<TimetableScreen> createState() => _TimetableScreenState();
}

class _TimetableScreenState extends ConsumerState<TimetableScreen> {
  late int _selectedIndex;

  @override
  void initState() {
    super.initState();
    final todayIndex = _weekdays.indexOf(AppDateUtils.dayOfWeekFor(DateTime.now()));
    _selectedIndex = todayIndex >= 0 ? todayIndex : 0;
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(timetableEntriesProvider);
    final todayIndex = _weekdays.indexOf(AppDateUtils.dayOfWeekFor(DateTime.now()));
    final selectedDay = _weekdays[_selectedIndex];
    final bottomInset = AppSpacing.xl + 64 + MediaQuery.of(context).padding.bottom;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const BuildingBackground(
            overlayColors: [
              Color(0xA60A0F28),
              Color(0xF20A0F28),
            ],
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.lg,
                    AppSpacing.lg,
                    AppSpacing.lg,
                    AppSpacing.md,
                  ),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Timetable',
                      style: AppTextStyles.headingLg.copyWith(color: Colors.white),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  child: _DaySelector(
                    selectedIndex: _selectedIndex,
                    todayIndex: todayIndex,
                    onSelect: (index) => setState(() => _selectedIndex = index),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                if (entriesAsync.hasValue && entriesAsync.hasError && isConnectivityError(entriesAsync.error))
                  const Padding(
                    padding: EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.md),
                    child: OfflineBanner(),
                  ),
                Expanded(
                  child: RefreshIndicator(
                    color: AppColors.accentGreen,
                    backgroundColor: AppColors.surface,
                    onRefresh: () async {
                      ref.invalidate(timetableEntriesProvider);
                      await ref.read(timetableEntriesProvider.future);
                    },
                    child: Builder(
                      builder: (context) {
                        final entries = entriesAsync.value;
                        if (entries == null) {
                          if (entriesAsync.isLoading) {
                            return ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                              children: const [ShimmerLoader()],
                            );
                          }
                          final connectivityIssue = isConnectivityError(entriesAsync.error);
                          return ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.lg,
                                  vertical: AppSpacing.xl,
                                ),
                                child: Text(
                                  connectivityIssue
                                      ? 'No connection. Pull down to try again.'
                                      : 'Could not load your timetable.',
                                  style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ],
                          );
                        }

                        final dayEntries = entries.where((e) => e.dayOfWeek == selectedDay).toList()
                          ..sort((a, b) => a.period.periodNumber.compareTo(b.period.periodNumber));
                        return _DayScheduleList(entries: dayEntries, bottomInset: bottomInset);
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DaySelector extends StatelessWidget {
  const _DaySelector({required this.selectedIndex, required this.todayIndex, required this.onSelect});

  final int selectedIndex;
  final int todayIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      blur: 12,
      fillOpacity: 0.1,
      borderOpacity: 0.15,
      borderRadius: 16,
      padding: const EdgeInsets.all(4),
      child: SizedBox(
        height: 44,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final itemWidth = constraints.maxWidth / _weekdays.length;
            return Stack(
              children: [
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOut,
                  left: itemWidth * selectedIndex,
                  top: 0,
                  bottom: 0,
                  width: itemWidth,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                Row(
                  children: [
                    for (var i = 0; i < _weekdays.length; i++)
                      Expanded(
                        child: _DayPill(
                          label: _dayLabels[i],
                          isSelected: i == selectedIndex,
                          isToday: i == todayIndex,
                          onTap: () => onSelect(i),
                        ),
                      ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill({
    required this.label,
    required this.isSelected,
    required this.isToday,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 14,
              color: isSelected ? AppColors.onWhiteText : Colors.white.withValues(alpha: 0.8),
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
          const SizedBox(height: 3),
          SizedBox(
            width: 4,
            height: 4,
            child: isToday
                ? DecoratedBox(
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.primaryBlue : AppColors.accentGreen,
                      shape: BoxShape.circle,
                    ),
                  )
                : null,
          ),
        ],
      ),
    );
  }
}

class _DayScheduleList extends StatelessWidget {
  const _DayScheduleList({required this.entries, required this.bottomInset});

  final List<TimetableEntry> entries;
  final double bottomInset;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      // Stays scrollable (rather than a plain Center) so the enclosing
      // RefreshIndicator's pull gesture keeps working in this state too.
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Text(
              'No classes scheduled for this day.',
              style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, bottomInset),
      itemCount: entries.length,
      separatorBuilder: (context, index) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (context, index) {
        final entry = entries[index];
        return GestureDetector(
          onTap: () => _showDetails(context, entry),
          child: PeriodCard(
            periodNumber: entry.period.periodNumber,
            timeLabel: AppDateUtils.formatPeriodTime(entry.period.startTime),
            subjectName: entry.subjectName,
            className: entry.className,
          ),
        );
      },
    );
  }

  void _showDetails(BuildContext context, TimetableEntry entry) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _PeriodDetailsSheet(entry: entry),
    );
  }
}

class _PeriodDetailsSheet extends StatelessWidget {
  const _PeriodDetailsSheet({required this.entry});

  final TimetableEntry entry;

  @override
  Widget build(BuildContext context) {
    final subjectColor = SubjectColors.forSubject(entry.subjectName);

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.sheetRadius)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.photoOverlay.withValues(alpha: 0.85),
            border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.15))),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.xl),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Text(
                    entry.subjectName ?? 'Free period',
                    style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: subjectColor.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      entry.className,
                      style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: subjectColor),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _DetailRow(
                    icon: Icons.schedule_outlined,
                    label: 'Time',
                    value:
                        '${AppDateUtils.formatPeriodTime(entry.period.startTime)} – ${AppDateUtils.formatPeriodTime(entry.period.endTime)}',
                  ),
                  _DetailRow(icon: Icons.location_city_outlined, label: 'Campus', value: entry.campusName),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.white.withValues(alpha: 0.6)),
          const SizedBox(width: AppSpacing.sm),
          Text('$label: ', style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6))),
          Expanded(
            child: Text(value, style: GoogleFonts.inter(fontSize: 14, color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
