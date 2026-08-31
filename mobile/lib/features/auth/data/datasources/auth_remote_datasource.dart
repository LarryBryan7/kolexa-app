// auth_remote_datasource.dart — Fuente de datos remota de Auth

import '../../../../core/api/api_client.dart';
import '../models/user_model.dart';

class AuthRemoteDataSource {
  // Necesitamos el ApiClient para hacer las peticiones HTTP
  final ApiClient _client;

  // Constructor: recibimos el ApiClient por inyección de dependencias
  // (se lo damos desde afuera en lugar de crearlo aquí)
  AuthRemoteDataSource(this._client);

  // ── login ─────────────────────────────────────────────────
  Future<LoginResponse> login({
    required String email,
    required String password,
    String? firebaseToken,
  }) async {
    // Construimos el cuerpo de la petición como un Map
    // (se serializa a JSON automáticamente con Dio)
    final body = {
      'email': email,
      'password': password,
      // Incluimos el firebaseToken solo si no es null
      // El if dentro de un Map en Dart: if (condicion) 'clave': 'valor'
      if (firebaseToken != null) 'firebaseToken': firebaseToken,
    };

    // POST /auth/login → devuelve {user, accessToken, refreshToken}
    // _client.post() ya maneja los errores de red con mensajes claros
    final response = await _client.post('auth/login', data: body);

    // Convertimos el JSON de la respuesta en nuestro modelo tipado
    // response.data es el cuerpo de la respuesta ya decodificado
    return LoginResponse.fromJson(response.data as Map<String, dynamic>);
  }

  // ── syncPushToken ─────────────────────────────────────────
  Future<void> syncPushToken(String firebaseToken) async {
    await _client.post('auth/push-token', data: {'firebaseToken': firebaseToken});
  }

  // ── loginWithGoogle ───────────────────────────────────────
  Future<LoginResponse> loginWithGoogle({
    required String idToken,
    required String invitationToken,
    String? firebaseToken,
  }) async {
    final body = {
      'idToken': idToken,
      'invitationToken': invitationToken,
      if (firebaseToken != null) 'firebaseToken': firebaseToken,
    };

    // POST /auth/google → devuelve {user, accessToken, refreshToken}
    final response = await _client.post('auth/google', data: body);

    return LoginResponse.fromJson(response.data as Map<String, dynamic>);
  }

  // ── logout ────────────────────────────────────────────────
  Future<void> logout({String? refreshToken}) async {
    // POST /auth/logout (este endpoint requiere JWT — no es @Public)
    // El AuthInterceptor agrega el Bearer token automáticamente
    await _client.post(
      'auth/logout',
      data: refreshToken != null ? {'refreshToken': refreshToken} : null,
    );
  }

  // ── changePassword ────────────────────────────────────────
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _client.post(
      'auth/change-password',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
    // Si llega aquí sin excepción, el cambio fue exitoso
  }
}
