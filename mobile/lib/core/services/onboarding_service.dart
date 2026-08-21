// onboarding_service.dart — Snapshot del último login con Google

import 'package:shared_preferences/shared_preferences.dart';

class OnboardingService {
  OnboardingService._();
  static final OnboardingService instance = OnboardingService._();

  static const String _keyGoogleLinked = 'google_parent_linked_once_v1';

  static const String _keyLastFirstName = 'last_parent_first_name_v1';
  static const String _keyLastLastName = 'last_parent_last_name_v1';
  static const String _keyLastAvatar = 'last_parent_avatar_v1';

  // Instancia cacheada de SharedPreferences. Se inicializa en main()
  // ANTES de runApp para que el resto de la app la lea sin await.
  SharedPreferences? _prefs;

  // ── Inicialización ────────────────────────────────────────
  // Se llama desde main() antes de runApp. Cachea la instancia
  // para que el resto de la app lea el estado sin await.
  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
  }

  bool get hasLinkedGoogleBefore => _prefs?.getBool(_keyGoogleLinked) ?? false;

  Future<void> markGoogleLinked() async {
    await _prefs?.setBool(_keyGoogleLinked, true);
  }

  String? get lastLoginFirstName => _prefs?.getString(_keyLastFirstName);
  String? get lastLoginLastName => _prefs?.getString(_keyLastLastName);
  String? get lastLoginAvatar => _prefs?.getString(_keyLastAvatar);

  Future<void> saveLastLoginProfile({
    required String firstName,
    String? lastName,
    String? avatar,
  }) async {
    await Future.wait([
      _prefs?.setString(_keyLastFirstName, firstName) ?? Future.value(),
      if (lastName != null) _prefs?.setString(_keyLastLastName, lastName) ?? Future.value(),
      if (avatar != null) _prefs?.setString(_keyLastAvatar, avatar) ?? Future.value(),
    ]);
  }
}
