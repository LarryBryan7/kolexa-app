import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../datasources/auth_remote_datasource.dart';
import '../models/user_model.dart';
import '../../../../core/api/token_store.dart';
import '../../../../core/api/interceptors/auth_interceptor.dart';
import '../../../../core/services/google_sign_in_service.dart';
import '../../../../core/services/onboarding_service.dart';

class AuthRepository {
  final AuthRemoteDataSource _remoteDataSource;

  static const String _userKey = 'current_user_json';

  AuthRepository(this._remoteDataSource);

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  Future<UserModel> login({
    required String email,
    required String password,
    String? firebaseToken,
  }) async {
    final loginResponse = await _remoteDataSource.login(
      email: email,
      password: password,
      firebaseToken: firebaseToken,
    );

    await _saveSession(loginResponse.accessToken, loginResponse.refreshToken, loginResponse.user);

    return loginResponse.user;
  }

  // ── loginWithGoogle ───────────────────────────────────────
  // Inicio de sesión/registro con Google Sign-In (Fase 1).
  // Recibe el ID Token de Google, lo envía al backend y guarda la sesión.
  Future<UserModel> loginWithGoogle({
    required String idToken,
    required String invitationToken,
    String? firebaseToken,
  }) async {
    final loginResponse = await _remoteDataSource.loginWithGoogle(
      idToken: idToken,
      invitationToken: invitationToken,
      firebaseToken: firebaseToken,
    );

    await _saveSession(loginResponse.accessToken, loginResponse.refreshToken, loginResponse.user);
    await OnboardingService.instance.markGoogleParentLinked();
    await OnboardingService.instance.saveLastParentProfile(
      firstName: loginResponse.user.firstName,
      lastName: loginResponse.user.lastName,
      avatar: loginResponse.user.avatar,
    );

    return loginResponse.user;
  }

  Future<void> logout() async {
    final refreshToken = await TokenStore.readRefreshToken();
    try {
      await _remoteDataSource.logout(refreshToken: refreshToken);
    } catch (_) {}
    finally {
      await TokenStore.clear();
      await _clearLocalUser();
      // Cerrar la sesión de Google en el dispositivo para que el próximo
      // login vuelva a mostrar el selector de cuentas.
      try {
        await GoogleSignInService.instance.signOut();
      } catch (_) {}
    }
  }

  Future<UserModel?> getCurrentUser() async {
    final token = await TokenStore.readAccessToken();
    if (token == null) return null;

    final prefs = await _prefs;
    final userJson = prefs.getString(_userKey);
    if (userJson == null) return null;

    try {
      return UserModel.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
    } catch (_) {
      await TokenStore.clear();
      await _clearLocalUser();
      return null;
    }
  }

  Future<bool> hasActiveSession() => TokenStore.hasAccessToken();

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _remoteDataSource.changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
  }

  Future<void> _saveSession(String accessToken, String refreshToken, UserModel user) async {
    await TokenStore.save(accessToken: accessToken, refreshToken: refreshToken);
    AuthInterceptor.resetSessionExpiredFlag();

    final prefs = await _prefs;
    await prefs.setString(_userKey, jsonEncode(user.toJson()));
  }

  Future<void> _clearLocalUser() async {
    final prefs = await _prefs;
    await prefs.remove(_userKey);
  }
}
