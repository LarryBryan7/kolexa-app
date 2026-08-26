// google_sign_in_service.dart — Servicio de Google Sign-In (Fase 1)

import 'package:google_sign_in/google_sign_in.dart';

class GoogleSignInService {
  // Instancia única (singleton) para reutilizar la sesión de Google.
  static final GoogleSignInService instance = GoogleSignInService._();

  GoogleSignInService._();

  // ── Configuración del Client ID ───────────────────────────
  static const String _serverClientId =
      '171691080214-1t7108i5q0997upk7l6n7tq2ssr3a7r3.apps.googleusercontent.com';

  static const String _iosClientId =
      '171691080214-cj1osmcu6t4csu49onfbuetq40p3j6m6.apps.googleusercontent.com';

  final GoogleSignIn _googleSignIn = GoogleSignIn(
    clientId: _iosClientId,
    serverClientId: _serverClientId,
  );

  // ── signIn ────────────────────────────────────────────────
  Future<String> signIn() async {
    await _googleSignIn.signOut();
    final account = await _googleSignIn.signIn();
    if (account == null) {
      // El usuario canceló el selector de cuentas.
      throw Exception('Inicio de sesión con Google cancelado');
    }

    final authentication = await account.authentication;
    final idToken = authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw Exception('No se pudo obtener el ID Token de Google');
    }

    return idToken;
  }

  // ── signOut ───────────────────────────────────────────────
  Future<void> signOut() async {
    await _googleSignIn.signOut();
  }
}
