import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/network/network_error.dart';
import '../../../core/utils/date_utils.dart';
import '../../../shared/widgets/building_background.dart';
import '../../../shared/widgets/initials_avatar.dart';
import '../../../shared/widgets/now_period_card.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../../shared/widgets/period_card.dart';
import '../../../shared/widgets/shimmer_loader.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../data/home_providers.dart';
import '../data/models/teacher_profile.dart';
import '../data/models/timetable_entry.dart';

/// "Today's Classes" — the screen a teacher opens every morning.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _handleRefresh(WidgetRef ref) async {
    ref.invalidate(teacherProfileProvider);
    ref.invalidate(timetableEntriesProvider);
    await Future.wait([
      ref.read(teacherProfileProvider.future),
      ref.read(timetableEntriesProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(teacherProfileProvider);
    final entriesAsync = ref.watch(timetableEntriesProvider);
    final now = DateTime.now();

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
            child: RefreshIndicator(
              color: AppColors.accentGreen,
              backgroundColor: AppColors.surface,
              onRefresh: () => _handleRefresh(ref),
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
                    sliver: SliverToBoxAdapter(child: _HomeHeader(now: now, profileAsync: profileAsync)),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.lg,
                      AppSpacing.lg,
                      AppSpacing.xl + 64 + MediaQuery.of(context).padding.bottom,
                    ),
                    sliver: SliverToBoxAdapter(child: _ScheduleSection(entriesAsync: entriesAsync, now: now)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({required this.now, required this.profileAsync});

  final DateTime now;
  final AsyncValue<TeacherProfile> profileAsync;

  @override
  Widget build(BuildContext context) {
    // AsyncValue.value keeps returning the last-known data across a
    // background refresh failure instead of reverting to a placeholder.
    final profile = profileAsync.value;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StaggeredFadeIn(
                index: 0,
                child: Text(
                  AppDateUtils.formatFriendlyDate(now).toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: Colors.white.withValues(alpha: 0.55),
                    letterSpacing: 1,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              StaggeredFadeIn(
                index: 1,
                child: Text(
                  AppDateUtils.greetingFor(now),
                  style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w300, color: Colors.white.withValues(alpha: 0.7)),
                ),
              ),
              const SizedBox(height: 4),
              StaggeredFadeIn(
                index: 2,
                stagger: const Duration(milliseconds: 100),
                child: Text(
                  profile?.name ?? (profileAsync.isLoading ? '…' : 'Teacher'),
                  style: AppTextStyles.displayName.copyWith(color: Colors.white, fontSize: 34),
                ),
              ),
            ],
          ),
        ),
        StaggeredFadeIn(index: 0, child: InitialsAvatar(initials: profile?.initials ?? '')),
      ],
    );
  }
}

class _ScheduleSection extends StatelessWidget {
  const _ScheduleSection({required this.entriesAsync, required this.now});

  final AsyncValue<List<TimetableEntry>> entriesAsync;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final entries = entriesAsync.value;

    if (entries == null) {
      // No cached data yet — either still loading or a real, first-load error.
      if (entriesAsync.isLoading) {
        return const Padding(
          padding: EdgeInsets.only(top: AppSpacing.lg),
          child: ShimmerLoader(),
        );
      }
      final connectivityIssue = isConnectivityError(entriesAsync.error);
      return _MessageState(
        icon: connectivityIssue ? Icons.cloud_off_rounded : Icons.wifi_off_rounded,
        message: connectivityIssue
            ? 'No connection. Pull down to try again.'
            : 'Could not load your schedule. Pull down to try again.',
      );
    }

    final showOfflineBanner = entriesAsync.hasError && isConnectivityError(entriesAsync.error);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showOfflineBanner) ...[
          const OfflineBanner(),
          const SizedBox(height: AppSpacing.md),
        ],
        _buildSchedule(entries),
      ],
    );
  }

  Widget _buildSchedule(List<TimetableEntry> allEntries) {
    if (allEntries.isEmpty) {
      return const _MessageState(
        icon: Icons.school_outlined,
        message: "Your timetable hasn't been set up yet. Contact your school administrator.",
        spacious: true,
      );
    }

    final today = AppDateUtils.dayOfWeekFor(now);
    final todayEntries = allEntries.where((e) => e.dayOfWeek == today).toList()
      ..sort((a, b) => a.period.periodNumber.compareTo(b.period.periodNumber));

    if (todayEntries.isEmpty) {
      return const _MessageState(icon: Icons.free_breakfast_outlined, message: 'No classes scheduled for today.');
    }

    TimetableEntry? nowEntry;
    for (final entry in todayEntries) {
      if (AppDateUtils.isPeriodNow(entry.period.startTime, entry.period.endTime, now)) {
        nowEntry = entry;
        break;
      }
    }

    final restEntries = todayEntries.where((e) => e.id != nowEntry?.id).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (nowEntry != null) ...[
          NowPeriodCard(
            subjectName: nowEntry.subjectName ?? 'Free period',
            className: nowEntry.className,
            campusName: nowEntry.campusName,
            periodNumber: nowEntry.period.periodNumber,
            endTime: nowEntry.period.endTime,
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        for (var i = 0; i < restEntries.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sm),
          _buildPeriodEntry(restEntries[i], i),
        ],
      ],
    );
  }

  Widget _buildPeriodEntry(TimetableEntry entry, int index) {
    final isPast = AppDateUtils.isPeriodPast(entry.period.endTime, now);
    final card = PeriodCard(
      periodNumber: entry.period.periodNumber,
      timeLabel: AppDateUtils.formatPeriodTime(entry.period.startTime),
      subjectName: entry.subjectName,
      className: entry.className,
      isPast: isPast,
    );
    return isPast ? card : StaggeredFadeIn(index: index, child: card);
  }
}

class _MessageState extends StatelessWidget {
  const _MessageState({required this.icon, required this.message, this.spacious = false});

  final IconData icon;
  final String message;
  final bool spacious;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: spacious ? AppSpacing.xxl : AppSpacing.xl),
      child: Column(
        children: [
          Icon(icon, size: spacious ? 48 : 36, color: Colors.white.withValues(alpha: 0.5)),
          const SizedBox(height: AppSpacing.md),
          Text(
            message,
            style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
