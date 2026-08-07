import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/constants/app_colors.dart';

class _NavItemSpec {
  const _NavItemSpec({required this.icon, required this.outlineIcon, required this.label});

  final IconData icon;
  final IconData outlineIcon;
  final String label;
}

const _items = [
  _NavItemSpec(icon: Icons.home_rounded, outlineIcon: Icons.home_outlined, label: 'Home'),
  _NavItemSpec(
    icon: Icons.calendar_month_rounded,
    outlineIcon: Icons.calendar_month_outlined,
    label: 'Timetable',
  ),
  _NavItemSpec(icon: Icons.person_rounded, outlineIcon: Icons.person_outline_rounded, label: 'Profile'),
];

/// 3-tab bottom navigation — true frosted glass (heavy blur, mostly-
/// translucent tint, soft top highlight) with an animated sliding pill
/// behind the active tab. The active tab is the school green; inactive
/// tabs are muted white.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({super.key, required this.currentIndex, required this.onTap});

  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
        child: DecoratedBox(
          decoration: BoxDecoration(
            // A light tint (not a near-opaque fill) so the blurred content
            // behind keeps showing through — the actual glass part of
            // "glassmorphism". A faint gradient (top slightly lighter) sells
            // the sheen the same way GlassCard's flat tint doesn't need to,
            // since this bar spans the full width.
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.photoOverlay.withValues(alpha: 0.42),
                AppColors.photoOverlay.withValues(alpha: 0.58),
              ],
            ),
            border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.22))),
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 64,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final itemWidth = constraints.maxWidth / _items.length;
                  return Stack(
                    children: [
                      AnimatedPositioned(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOutCubic,
                        left: itemWidth * currentIndex,
                        top: 8,
                        bottom: 8,
                        width: itemWidth,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accentGreen.withValues(alpha: 0.18),
                                  blurRadius: 16,
                                  spreadRadius: -2,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          for (var i = 0; i < _items.length; i++)
                            Expanded(
                              child: _NavItem(
                                icon: _items[i].icon,
                                outlineIcon: _items[i].outlineIcon,
                                label: _items[i].label,
                                isActive: currentIndex == i,
                                onTap: () => onTap(i),
                              ),
                            ),
                        ],
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.outlineIcon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final IconData icon;
  final IconData outlineIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  static const _duration = Duration(milliseconds: 220);
  static const _curve = Curves.easeOutCubic;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? AppColors.accentGreen : Colors.white.withValues(alpha: 0.45);
    return InkWell(
      onTap: () {
        if (!isActive) HapticFeedback.selectionClick();
        onTap();
      },
      borderRadius: BorderRadius.circular(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Lifts and scales the active icon up a touch instead of just
          // snapping the color — the "premium switch" the flat icon swap
          // didn't have.
          AnimatedSlide(
            duration: _duration,
            curve: _curve,
            offset: isActive ? const Offset(0, -0.08) : Offset.zero,
            child: AnimatedScale(
              duration: _duration,
              curve: _curve,
              scale: isActive ? 1.08 : 1.0,
              child: AnimatedSwitcher(
                duration: _duration,
                switchInCurve: _curve,
                switchOutCurve: _curve,
                transitionBuilder: (child, animation) =>
                    ScaleTransition(scale: animation, child: FadeTransition(opacity: animation, child: child)),
                child: Icon(
                  isActive ? icon : outlineIcon,
                  key: ValueKey(isActive),
                  color: color,
                  size: 22,
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          AnimatedDefaultTextStyle(
            duration: _duration,
            curve: _curve,
            style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w500, color: color),
            child: Text(label),
          ),
        ],
      ),
    );
  }
}
