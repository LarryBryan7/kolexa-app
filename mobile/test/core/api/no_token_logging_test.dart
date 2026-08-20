// no_token_logging_test.dart — sin logs de tokens (I-3, requisito #9)

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final filesToCheck = [
    'lib/core/api/token_store.dart',
    'lib/core/api/interceptors/auth_interceptor.dart',
    'lib/features/auth/data/repositories/auth_repository.dart',
  ];

  // Variables/identificadores que representan un token real en este código.
  final tokenIdentifiers = [
    'accessToken', 'refreshToken', 'newAccessToken', 'randomPassword',
  ];

  final loggingCalls = RegExp(r'\b(print|debugPrint|log)\s*\(');

  for (final relativePath in filesToCheck) {
    test('9) $relativePath no imprime ningún token por consola', () {
      final file = File(relativePath);
      expect(file.existsSync(), isTrue, reason: '$relativePath debería existir');

      final lines = file.readAsLinesSync();
      final offendingLines = <String>[];

      for (final line in lines) {
        if (!loggingCalls.hasMatch(line)) continue;
        final codeOnly = line.split('//').first;
        if (!loggingCalls.hasMatch(codeOnly)) continue;

        if (tokenIdentifiers.any((id) => codeOnly.contains(id))) {
          offendingLines.add(line.trim());
        }
      }

      expect(
        offendingLines,
        isEmpty,
        reason: 'Se encontró una llamada de log que referencia un token: $offendingLines',
      );
    });
  }
}
