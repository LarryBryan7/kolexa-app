// token_store.dart — Única fuente de verdad de los tokens de sesión

import 'package:shared_preferences/shared_preferences.dart';

class TokenStore {
  TokenStore._();

  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';

  static String? _accessToken;
  static String? _refreshToken;

  static Future<String?>? _refreshInFlight;

  /// Token de acceso cacheado en memoria (null si el proceso no lo cargó
  /// todavía — usar [readAccessToken] si se necesita garantía de lectura).
  static String? get cachedAccessToken => _accessToken;

  /// Guarda el par de tokens de una sesión nueva (login / loginWithGoogle).
  static Future<void> save({
    required String accessToken,
    required String refreshToken,
  }) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      prefs.setString(_accessTokenKey, accessToken),
      prefs.setString(_refreshTokenKey, refreshToken),
    ]);
  }

  /// Actualiza solo el access token (resultado de un refresh exitoso) —
  /// el refresh token no cambia (el backend no lo rota, ver auth.service.ts).
  static Future<void> updateAccessToken(String accessToken) async {
    _accessToken = accessToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_accessTokenKey, accessToken);
  }

  /// Limpia la sesión por completo (logout, o refresh fallido = sesión
  /// realmente perdida).
  static Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
    _refreshInFlight = null;
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      prefs.remove(_accessTokenKey),
      prefs.remove(_refreshTokenKey),
    ]);
  }

  static Future<void> _hydrate() async {
    if (_accessToken != null || _refreshToken != null) return;
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString(_accessTokenKey);
    _refreshToken = prefs.getString(_refreshTokenKey);
  }

  static Future<String?> readAccessToken() async {
    if (_accessToken != null) return _accessToken;
    await _hydrate();
    return _accessToken;
  }

  static Future<String?> readRefreshToken() async {
    if (_refreshToken != null) return _refreshToken;
    await _hydrate();
    return _refreshToken;
  }

  static Future<bool> hasAccessToken() async => (await readAccessToken()) != null;

  static Future<String?> refreshAccessToken(
    Future<String?> Function(String refreshToken) doRefresh,
  ) {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;

    final future = _performRefresh(doRefresh);
    _refreshInFlight = future;
    return future;
  }

  static Future<String?> _performRefresh(
    Future<String?> Function(String) doRefresh,
  ) async {
    try {
      final refreshToken = await readRefreshToken();
      if (refreshToken == null) return null;

      final newAccessToken = await doRefresh(refreshToken);
      if (newAccessToken != null) {
        await updateAccessToken(newAccessToken);
      }
      return newAccessToken;
    } finally {
      _refreshInFlight = null;
    }
  }
}
