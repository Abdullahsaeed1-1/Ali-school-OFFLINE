import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/subject_colors.dart';
import '../../../core/network/network_error.dart';
import '../../../shared/widgets/building_background.dart';
import '../../../shared/widgets/campus_badge.dart';
import '../../../shared/widgets/initials_avatar.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../../shared/widgets/shimmer_loader.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/data/session.dart';
import '../data/home_providers.dart';
import '../data/models/teacher_profile.dart';
import '../data/models/timetable_entry.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Sign out of Teacher Portal?', style: AppTextStyles.headingMd),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Cancel', style: AppTextStyles.bodyMd),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Sign out', style: AppTextStyles.bodyMd.copyWith(color: AppColors.maroon)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    await ref.read(authRepositoryProvider).logout();
    // Otherwise the next login (a different teacher, on the same running
    // app) would keep reading this session's cached teacher id.
    ref.invalidate(currentTeacherIdProvider);
    if (context.mounted) context.go('/login');
  }

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
    // Read via .value (not .when) so a failed background refresh — e.g. the
    // pull-to-refresh below losing connectivity — keeps showing the last
    // cached profile with an OfflineBanner instead of wiping the screen,
    // matching the pattern already used on Home/Timetable.
    final profile = profileAsync.value;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const BuildingBackground(overlayColors: [Color(0xA60A0F28), Color(0xF20A0F28)]),
          SafeArea(
            child: profile == null
                ? RefreshIndicator(
                    color: AppColors.accentGreen,
                    backgroundColor: AppColors.surface,
                    onRefresh: () => _handleRefresh(ref),
                    child: _buildNoCachedData(profileAsync),
                  )
                : _buildProfile(context, ref, profile, profileAsync, entriesAsync),
          ),
        ],
      ),
    );
  }

  Widget _buildNoCachedData(AsyncValue<TeacherProfile> profileAsync) {
    if (profileAsync.isLoading) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: const [ShimmerLoader()],
      );
    }

    final connectivityIssue = isConnectivityError(profileAsync.error);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xxl),
          child: Text(
            connectivityIssue
                ? 'No connection. Pull down to try again.'
                : 'Could not load your profile. Pull down to try again.',
            style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }

  Widget _buildProfile(
    BuildContext context,
    WidgetRef ref,
    TeacherProfile profile,
    AsyncValue<TeacherProfile> profileAsync,
    AsyncValue<List<TimetableEntry>> entriesAsync,
  ) {
    final weeklyPeriods = entriesAsync.asData?.value.length;
    final showOfflineBanner = profileAsync.hasError && isConnectivityError(profileAsync.error);
    final topHeight = MediaQuery.of(context).size.height * 0.3;

    return Column(
      children: [
        SizedBox(
          height: topHeight,
          width: double.infinity,
          // Positioned (rather than a bottom-aligned Column filling the
          // whole SizedBox) so this content sizes to itself and can never
          // trigger a RenderFlex overflow if the header is ever shorter than
          // the avatar+name+email+badge stack needs — e.g. small-height
          // devices or larger system font scales.
          child: Stack(
            children: [
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      InitialsAvatar(initials: profile.initials, size: 80, borderWidth: 2),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        profile.name,
                        style: AppTextStyles.displayName.copyWith(color: Colors.white),
                        textAlign: TextAlign.center,
                      ),
                      if (profile.email != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          profile.email!,
                          style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.sm),
                      CampusBadge(campusName: profile.campusName),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.sheetRadius)),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.15))),
                ),
                child: RefreshIndicator(
                  color: AppColors.accentGreen,
                  onRefresh: () => _handleRefresh(ref),
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.xl, AppSpacing.lg, AppSpacing.xxl),
                    children: [
                      if (showOfflineBanner) ...[
                        const OfflineBanner(),
                        const SizedBox(height: AppSpacing.md),
                      ],
                      Row(
                        children: [
                          Expanded(
                            child: _StatCard(label: 'Subjects', value: '${profile.subjects.length}'),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: _StatCard(label: 'Classes', value: '${profile.classCount}'),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: _StatCard(label: 'Periods/Week', value: weeklyPeriods?.toString() ?? '—'),
                          ),
                        ],
                      ),
                      if (profile.subjects.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.xl),
                        Text(
                          'SUBJECTS',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withValues(alpha: 0.6),
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Wrap(
                          spacing: AppSpacing.sm,
                          runSpacing: AppSpacing.sm,
                          children: [
                            for (final subject in profile.subjects) _SubjectPill(name: subject.name),
                          ],
                        ),
                      ],
                      const SizedBox(height: AppSpacing.xl),
                      Text(
                        'THIS WEEK',
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withValues(alpha: 0.6),
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      _WeekProgressBar(
                        assigned: weeklyPeriods,
                        target: profile.targetPeriodsPerWeek,
                      ),
                      const SizedBox(height: AppSpacing.xxl),
                      OutlinedButton.icon(
                        onPressed: () => _handleLogout(context, ref),
                        icon: const Icon(Icons.logout_rounded, size: 18),
                        label: const Text('Sign Out'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.maroon,
                          side: const BorderSide(color: AppColors.maroon),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md, horizontal: AppSpacing.sm),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppSpacing.cardRadius),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: GoogleFonts.inter(fontSize: 11, color: Colors.white.withValues(alpha: 0.6)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _SubjectPill extends StatelessWidget {
  const _SubjectPill({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final color = SubjectColors.forSubject(name);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        name,
        style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: color),
      ),
    );
  }
}

class _WeekProgressBar extends StatelessWidget {
  const _WeekProgressBar({required this.assigned, required this.target});

  final int? assigned;
  final int target;

  @override
  Widget build(BuildContext context) {
    final ratio = (assigned != null && target > 0) ? (assigned! / target).clamp(0.0, 1.0) : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(
            height: 10,
            width: double.infinity,
            child: Stack(
              children: [
                Positioned.fill(child: ColoredBox(color: Colors.white.withValues(alpha: 0.1))),
                Positioned.fill(
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: ratio),
                    duration: const Duration(milliseconds: 800),
                    curve: Curves.easeOut,
                    builder: (context, value, child) => FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: value,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.primaryBlue, AppColors.accentGreen],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          assigned != null ? '$assigned of $target periods assigned' : 'Loading…',
          style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.6)),
        ),
      ],
    );
  }
}
