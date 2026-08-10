// kolexa_logo.dart — Marca "K" (sistema de marca v2)

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class KolexaLogo extends StatelessWidget {
  const KolexaLogo({super.key, this.height = 53, this.color = Colors.white});

  final double height;
  final Color color;

  // proporción real del SVG exportado: 39 × 53
  static const double _naturalWidth = 39;
  static const double _naturalHeight = 53;

  @override
  Widget build(BuildContext context) {
    final width = height / _naturalHeight * _naturalWidth;
    return SvgPicture.asset(
      'assets/images/kolexa_logo.svg',
      width: width,
      height: height,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    );
  }
}
