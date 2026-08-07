import 'package:flutter/material.dart';

/// The school shield on a white circular badge. The source JPEG has a white
/// (non-transparent) background, so it's set on a matching white circle
/// rather than directly on the dark app background — otherwise it reads as
/// a stray white box instead of an intentional badge.
class SchoolLogo extends StatelessWidget {
  const SchoolLogo({super.key, this.size = 96});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: Colors.black26, blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      padding: EdgeInsets.all(size * 0.12),
      child: Image.asset('assets/images/school_logo.jpeg', fit: BoxFit.contain),
    );
  }
}
