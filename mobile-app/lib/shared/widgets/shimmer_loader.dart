import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_spacing.dart';

/// A shimmering placeholder shaped like a period card, shown while the
/// schedule is loading — per the animation rules, never a bare spinner
/// sitting in a content area.
class ShimmerLoader extends StatelessWidget {
  const ShimmerLoader({super.key, this.count = 4});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.card,
      highlightColor: AppColors.surface,
      child: Column(
        children: List.generate(
          count,
          (index) => Container(
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(AppSpacing.cardRadius),
            ),
          ),
        ),
      ),
    );
  }
}
