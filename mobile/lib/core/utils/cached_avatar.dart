// cached_avatar.dart — Cache real para fotos de perfil/avatares

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';

// Para usar como `backgroundImage` de un CircleAvatar (o cualquier lugar
// que pida un ImageProvider en vez de un widget).
ImageProvider cachedAvatarProvider(String url) =>
    CachedNetworkImageProvider(url, cacheKey: _stableCacheKey(url));

// Para usar como widget de imagen directo (en vez de Image.network),
// cuando hace falta placeholder/errorWidget propios.
Widget cachedAvatarImage(
  String url, {
  required double width,
  required double height,
  BoxFit fit = BoxFit.cover,
  Widget Function(BuildContext, String)? placeholder,
  required Widget Function(BuildContext, String, Object) errorWidget,
}) {
  return CachedNetworkImage(
    imageUrl: url,
    cacheKey: _stableCacheKey(url),
    width: width,
    height: height,
    fit: fit,
    placeholder: placeholder,
    errorWidget: errorWidget,
  );
}

String _stableCacheKey(String url) {
  final uri = Uri.tryParse(url);
  // Si no se puede parsear (no debería pasar), se usa la URL completa —
  // peor que el fix pero nunca rompe.
  return uri?.path.isNotEmpty == true ? uri!.path : url;
}
