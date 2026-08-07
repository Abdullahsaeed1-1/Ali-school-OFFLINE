import 'dart:ui';

import 'package:flutter/material.dart';

/// A frosted-glass container: blurred backdrop + translucent white fill +
/// a subtle white border. Used everywhere a card sits on top of the
/// school-building photo (NOW card, period cards, day selector, bottom nav,
/// bottom sheets). [BackdropFilter] renders consistently across Flutter's
/// rendering backends, so no separate no-blur fallback is required.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.blur = 16,
    this.fillOpacity = 0.1,
    this.borderOpacity = 0.15,
    this.borderRadius = 20,
    this.padding,
  });

  final Widget child;
  final double blur;
  final double fillOpacity;
  final double borderOpacity;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: fillOpacity),
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(color: Colors.white.withValues(alpha: borderOpacity)),
          ),
          child: child,
        ),
      ),
    );
  }
}
