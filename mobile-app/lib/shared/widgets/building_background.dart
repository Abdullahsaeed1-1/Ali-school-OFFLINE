import 'package:flutter/material.dart';

/// Full-bleed school building photo with a dark gradient overlay drawn on
/// top — the visual signature shared by Splash/Login/Home/Timetable/Profile.
/// WebAdmin deliberately never uses this; it's an admin tool, not a teacher-
/// facing brand surface.
class BuildingBackground extends StatelessWidget {
  const BuildingBackground({
    super.key,
    required this.overlayColors,
    this.overlayStops,
  });

  final List<Color> overlayColors;
  final List<double>? overlayStops;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset('assets/images/school-building.jpeg', fit: BoxFit.cover),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: overlayColors,
              stops: overlayStops,
            ),
          ),
        ),
      ],
    );
  }
}
