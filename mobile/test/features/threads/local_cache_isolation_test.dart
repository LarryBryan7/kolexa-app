// local_cache_isolation_test.dart — cache en memoria al cerrar sesión

import 'package:flutter_test/flutter_test.dart';
import 'package:kolexa/features/threads/data/threads_repository.dart';
import 'package:kolexa/features/threads/ui/inbox_page.dart';
import 'package:kolexa/features/threads/ui/new_message_page.dart';
import 'package:kolexa/features/threads/ui/thread_page.dart';

void main() {
  tearDown(() {
    InboxPage.clearCache();
    ThreadPage.clearCache();
    NewMessagePage.clearCache();
  });

  group('InboxPage', () {
    test('clearCache() vacía el cache de la bandeja de la cuenta anterior', () {
      InboxPage.debugCachedThreads = [
        ThreadSummary(
          id: 't1',
          kind: 'direct',
          priority: 'normal',
          lastMessageAt: DateTime(2026, 1, 1),
          unread: false,
          unreadCount: 0,
          muted: false,
        ),
      ];
      expect(InboxPage.debugCachedThreads, isNotEmpty);

      InboxPage.clearCache();

      expect(InboxPage.debugCachedThreads, isNull);
    });
  });

  group('ThreadPage', () {
    test('clearCache() vacía TODAS las conversaciones cacheadas, de cualquier hilo', () {
      ThreadPage.debugCache['thread-a'] = ThreadMessagesPage(
        messages: const [],
        otherLastReadAt: null,
        otherLastActiveAt: null,
      );
      ThreadPage.debugCache['thread-b'] = ThreadMessagesPage(
        messages: const [],
        otherLastReadAt: null,
        otherLastActiveAt: null,
      );
      expect(ThreadPage.debugCache, isNotEmpty);

      ThreadPage.clearCache();

      expect(ThreadPage.debugCache, isEmpty);
    });
  });

  group('NewMessagePage', () {
    test('clearCache() vacía el cache de contactos de la cuenta anterior', () {
      NewMessagePage.debugCachedContacts = const [
        Contact(userId: '1', name: 'Alguien', avatar: null, role: 'teacher', students: []),
      ];
      expect(NewMessagePage.debugCachedContacts, isNotEmpty);

      NewMessagePage.clearCache();

      expect(NewMessagePage.debugCachedContacts, isNull);
    });
  });
}
