// user_model_test.dart — round-trip toJson() → fromJson()

import 'package:flutter_test/flutter_test.dart';
import 'package:kolexa/features/auth/data/models/user_model.dart';

void main() {
  group('UserModel — round-trip toJson() → fromJson()', () {
    test('un usuario recién parseado del backend sobrevive el round-trip de caché local', () {
      // Forma real que manda el backend (roles como objetos).
      final fromBackend = UserModel.fromJson({
        'id': '15',
        'email': 'padre@gmail.com',
        'firstName': 'Larry',
        'lastName': 'Quiroz',
        'avatar': 'https://lh3.googleusercontent.com/foo.jpg',
        'roles': [
          {'role': 'parent', 'schoolId': '1', 'schoolName': 'Colegio San Francisco'},
        ],
        'children': [],
      });

      // Esto es exactamente lo que hace AuthRepository._saveSession() al
      // cachear, y getCurrentUser() al releer en el siguiente arranque.
      final cached = fromBackend.toJson();
      final rehydrated = UserModel.fromJson(cached);

      expect(rehydrated.id, fromBackend.id);
      expect(rehydrated.email, fromBackend.email);
      expect(rehydrated.roles, fromBackend.roles);
      expect(rehydrated.schoolId, fromBackend.schoolId);
      expect(rehydrated.schoolName, fromBackend.schoolName);
      expect(rehydrated.hasRole('parent'), isTrue);
    });

    test('sobrevive dos round-trips seguidos (arranque en frío tras arranque en frío)', () {
      final original = UserModel.fromJson({
        'id': '7',
        'email': 'docente@colegio.edu.pe',
        'firstName': 'Ana',
        'lastName': 'García',
        'roles': [
          {'role': 'teacher', 'schoolId': '2', 'schoolName': 'Colegio Test'},
        ],
        'children': [],
      });

      final rehydratedOnce = UserModel.fromJson(original.toJson());
      final rehydratedTwice = UserModel.fromJson(rehydratedOnce.toJson());

      expect(rehydratedTwice.roles, original.roles);
      expect(rehydratedTwice.hasRole('teacher'), isTrue);
    });

    test('usuario sin colegio (schoolId/schoolName null) también sobrevive el round-trip', () {
      final original = UserModel.fromJson({
        'id': '99',
        'email': 'sin-colegio@test.com',
        'firstName': 'X',
        'lastName': 'Y',
        'roles': <dynamic>[],
        'children': [],
      });

      final rehydrated = UserModel.fromJson(original.toJson());

      expect(rehydrated.roles, isEmpty);
      expect(rehydrated.schoolId, isNull);
      expect(rehydrated.schoolName, isNull);
    });
  });
}
