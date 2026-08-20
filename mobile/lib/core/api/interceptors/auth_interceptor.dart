// auth_interceptor.dart — Interceptor de autenticación JWT

import 'package:dio/dio.dart';
import '../token_store.dart';

class AuthInterceptor extends Interceptor {
  AuthInterceptor({Dio Function()? bareDioFactory})
      : _bareDioFactory = bareDioFactory ?? (() => Dio());

  final Dio Function() _bareDioFactory;

  // Callback que el AuthBloc registra para forzar logout cuando el refresh falla.
  static void Function()? onSessionExpired;
  static bool _sessionExpiredFired = false;

  // ── onRequest ────────────────────────────────────────────
  // Se ejecuta ANTES de enviar cada petición.
  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await TokenStore.readAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  // ── onError ──────────────────────────────────────────────
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final is401 = err.response?.statusCode == 401;
    final code = _extractCode(err);
    final isSessionExpired = is401 && code == 'SESSION_TOKEN_EXPIRED';

    if (isSessionExpired) {
      final baseUrl = err.requestOptions.baseUrl;
      final newAccessToken = await TokenStore.refreshAccessToken(
        (refreshToken) => _callRefreshEndpoint(refreshToken, baseUrl),
      );

      if (newAccessToken != null) {
        try {
          err.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
          final retryResponse = await _bareDioFactory().fetch(err.requestOptions);
          return handler.resolve(retryResponse);
        } catch (retryError) {
          return handler.next(
            retryError is DioException ? retryError : err,
          );
        }
      }

      // El refresh falló de verdad (sin refreshToken guardado, o el
      // backend lo rechazó) — ahí sí la sesión está perdida.
      await TokenStore.clear();
      if (!_sessionExpiredFired) {
        _sessionExpiredFired = true;
        onSessionExpired?.call();
      }
    }

    handler.next(err);
  }

  static String? _extractCode(DioException err) {
    final data = err.response?.data;
    if (data is Map) return data['code'] as String?;
    return null;
  }

  Future<String?> _callRefreshEndpoint(String refreshToken, String baseUrl) async {
    try {
      // Dio "pelado", sin interceptores — evita un bucle infinito de 401s.
      final refreshDio = _bareDioFactory();
      final response = await refreshDio.post(
        '${baseUrl}auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final token = response.data is Map ? response.data['accessToken'] : null;
      return token is String ? token : null;
    } catch (_) {
      return null;
    }
  }

  static void resetSessionExpiredFlag() {
    _sessionExpiredFired = false;
  }
}
