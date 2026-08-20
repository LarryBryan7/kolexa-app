// onboarding_service.dart — Estado del onboarding (primera vez)

import 'package:shared_preferences/shared_preferences.dart';

class OnboardingService {
  OnboardingService._();
  static final OnboardingService instance = OnboardingService._();

  // Clave en SharedPreferences. Versionada por si en el futuro
  // queremos resetear el onboarding (ej: nueva versión de la app).
  static const String _keyOnboardingCompleted = 'onboarding_completed_v1';

  static const String _keySelectedRole = 'onboarding_selected_role_v1';

  static const String _keyGoogleParentLinked = 'google_parent_linked_once_v1';

  static const String _keyLastParentFirstName = 'last_parent_first_name_v1';
  static const String _keyLastParentLastName = 'last_parent_last_name_v1';
  static const String _keyLastParentAvatar = 'last_parent_avatar_v1';

  // Instancia cacheada de SharedPreferences. Se inicializa en main()
  // ANTES de runApp para que `isCompleted` sea síncrono.
  SharedPreferences? _prefs;

  // ── Inicialización ────────────────────────────────────────
  // Se llama desde main() antes de runApp. Cachea la instancia
  // para que el resto de la app lea el estado sin await.
  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // ── Estado ────────────────────────────────────────────────
  bool get isCompleted => _prefs?.getBool(_keyOnboardingCompleted) ?? false;

  // ── Acciones ──────────────────────────────────────────────
  // Marca el onboarding como completado. Se llama cuando el usuario
  // termina el flujo (selecciona su rol y presiona "Continuar").
  Future<void> complete() async {
    await _prefs?.setBool(_keyOnboardingCompleted, true);
  }

  // Rol elegido en role_selection_page. null si nunca se guardó (ej.
  // usuarios que ya habían completado el onboarding antes de este cambio).
  String? get selectedRole => _prefs?.getString(_keySelectedRole);

  Future<void> setSelectedRole(String role) async {
    await _prefs?.setString(_keySelectedRole, role);
  }

  // Útil para testing / debug: permite reiniciar el onboarding.
  Future<void> reset() async {
    await _prefs?.remove(_keyOnboardingCompleted);
  }

  bool get hasLinkedGoogleParentBefore =>
      _prefs?.getBool(_keyGoogleParentLinked) ?? false;

  Future<void> markGoogleParentLinked() async {
    await _prefs?.setBool(_keyGoogleParentLinked, true);
  }

  String? get lastParentFirstName => _prefs?.getString(_keyLastParentFirstName);
  String? get lastParentLastName => _prefs?.getString(_keyLastParentLastName);
  String? get lastParentAvatar => _prefs?.getString(_keyLastParentAvatar);

  Future<void> saveLastParentProfile({
    required String firstName,
    String? lastName,
    String? avatar,
  }) async {
    await Future.wait([
      _prefs?.setString(_keyLastParentFirstName, firstName) ?? Future.value(),
      if (lastName != null) _prefs?.setString(_keyLastParentLastName, lastName) ?? Future.value(),
      if (avatar != null) _prefs?.setString(_keyLastParentAvatar, avatar) ?? Future.value(),
    ]);
  }
}
