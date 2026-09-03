// sqlite_write_safety_test.dart — Fase 2: errores de SQLite (B2) +
// confirmación de que la deduplicación por id no se rompió

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:kolexa/core/db/app_database.dart';
import 'package:kolexa/features/threads/data/threads_local_store.dart';
import 'package:kolexa/features/threads/data/threads_repository.dart';

Contact _contact(String name) =>
    Contact(userId: '1', name: name, avatar: null, role: 'teacher', students: const []);

ThreadMessage _message(String id, String body) => ThreadMessage(
      id: id,
      senderId: '1',
      senderName: 'X',
      body: body,
      sentAt: DateTime(2026, 1, 1),
    );

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('B2 — el patrón .catchError contiene un error real de SQLite', () {
    late DebugPrintCallback originalDebugPrint;
    final logs = <String>[];

    setUp(() async {
      await AppDatabase.instance.close(); // a propósito: sin sesión activa
      logs.clear();
      originalDebugPrint = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) => logs.add(message ?? '');
    });

    tearDown(() {
      debugPrint = originalDebugPrint;
    });

    test(
        '6) saveInbox sin sesión activa lanza un StateError real — el mismo patrón '
        '.catchError de los 5 sitios lo contiene y lo registra, sin dejar un error sin manejar',
        () async {
      // Mismo patrón EXACTO que en inbox_page.dart/_refresh(),
      // thread_page.dart/_load()/_sendBody() y new_message_page.dart/_refresh().
      await ThreadsLocalStore.saveInbox([
        ThreadSummary(
          id: 't1',
          kind: 'direct',
          priority: 'normal',
          lastMessageAt: DateTime(2026, 1, 1),
          unread: false,
          unreadCount: 0,
          muted: false,
        ),
      ]).catchError((e, st) {
        debugPrint('[InboxPage] saveInbox falló: $e\n$st');
      });

      expect(logs.any((l) => l.contains('[InboxPage] saveInbox falló')), isTrue,
          reason: 'el fallo de la escritura debe quedar registrado para debugging');
      expect(logs.any((l) => l.contains('sin sesión activa')), isTrue,
          reason: 'el registro debe incluir la causa real del fallo, no un mensaje genérico');
    });

    test('el mismo patrón aplicado a saveThread/saveMessage/saveContacts también contiene el error',
        () async {
      await ThreadsLocalStore.saveThread(
        't1',
        const ThreadMessagesPage(messages: [], otherLastReadAt: null, otherLastActiveAt: null),
      ).catchError((e, st) => debugPrint('[ThreadPage] saveThread falló: $e'));

      await ThreadsLocalStore.saveMessage('t1', _message('m1', 'hola'))
          .catchError((e, st) => debugPrint('[ThreadPage] saveMessage falló: $e'));

      await ThreadsLocalStore.saveContacts([_contact('X')])
          .catchError((e, st) => debugPrint('[NewMessagePage] saveContacts falló: $e'));

      expect(logs.where((l) => l.contains('falló')).length, 3);
    });
  });

  group('deduplicación por id (requisito 7 — confirmar que sigue intacta)', () {
    setUp(() async {
      await AppDatabase.instance.close();
      final path = join(await databaseFactory.getDatabasesPath(), 'kolexa_777.db');
      try {
        await databaseFactory.deleteDatabase(path);
      } catch (_) {}
      await AppDatabase.instance.openForUser(777);
    });

    tearDown(() async {
      await AppDatabase.instance.close();
    });

    test('guardar el mismo id dos veces reemplaza la fila, nunca la duplica', () async {
      await ThreadsLocalStore.saveThread(
        't1',
        ThreadMessagesPage(
          messages: [_message('m1', 'versión vieja')],
          otherLastReadAt: null,
          otherLastActiveAt: null,
        ),
      );
      await ThreadsLocalStore.saveThread(
        't1',
        ThreadMessagesPage(
          messages: [_message('m1', 'versión nueva')],
          otherLastReadAt: null,
          otherLastActiveAt: null,
        ),
      );

      final page = await ThreadsLocalStore.loadThread('t1');
      expect(page!.messages.length, 1);
      expect(page.messages.single.body, 'versión nueva');
    });

    test('un mensaje que llega dos veces (misma id) desde dos saves distintos no produce fila duplicada',
        () async {
      final page = ThreadMessagesPage(
        messages: [_message('m1', 'hola'), _message('m2', 'chau')],
        otherLastReadAt: null,
        otherLastActiveAt: null,
      );
      await ThreadsLocalStore.saveThread('t1', page);
      await ThreadsLocalStore.saveThread('t1', page);

      final loaded = await ThreadsLocalStore.loadThread('t1');
      expect(loaded!.messages.length, 2);
    });
  });
}
