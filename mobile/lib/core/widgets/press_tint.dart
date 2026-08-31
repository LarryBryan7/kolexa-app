import 'package:flutter/material.dart';

Color pressedTint(Color base) {
  final hsl = HSLColor.fromColor(base);
  return hsl
      .withSaturation((hsl.saturation * 0.65).clamp(0.0, 1.0))
      .withLightness((hsl.lightness * 0.85).clamp(0.0, 1.0))
      .toColor()
      .withValues(alpha: 0.35);
}

class PressTint extends StatefulWidget {
  final Widget child;
  final Color tintColor;
  final BorderRadius borderRadius;
  final VoidCallback? onTap;

  const PressTint({
    super.key,
    required this.child,
    required this.tintColor,
    required this.borderRadius,
    this.onTap,
  });

  @override
  State<PressTint> createState() => _PressTintState();
}

class _PressTintState extends State<PressTint> {
  bool _pressed = false;
  DateTime? _pressedAt;

  static const _minVisible = Duration(milliseconds: 80);

  void _setPressed(bool value) {
    if (value) {
      _pressedAt = DateTime.now();
      if (!_pressed) setState(() => _pressed = true);
      return;
    }
    final pressedAt = _pressedAt;
    final elapsed = pressedAt == null ? _minVisible : DateTime.now().difference(pressedAt);
    if (elapsed >= _minVisible) {
      if (_pressed) setState(() => _pressed = false);
    } else {
      Future.delayed(_minVisible - elapsed, () {
        if (mounted && _pressed && _pressedAt == pressedAt) {
          setState(() => _pressed = false);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      child: AnimatedContainer(
        duration: Duration(milliseconds: _pressed ? 0 : 350),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          color: _pressed ? widget.tintColor : widget.tintColor.withValues(alpha: 0),
          borderRadius: widget.borderRadius,
        ),
        child: widget.child,
      ),
    );
  }
}
