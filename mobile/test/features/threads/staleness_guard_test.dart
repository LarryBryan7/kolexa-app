// staleness_guard_test.dart — Fase 1: generation/staleness guard (B1)

import 'package:flutter_test/flutter_test.dart';
import 'package:kolexa/features/threads/data/staleness_guard.dart';
import 'package:kolexa/features/threads/ui/inbox_page.dart';
import 'package:kolexa/features/threads/ui/new_message_page.dart';
import 'package:kolexa/features/threads/ui/thread_page.dart';

void main() {
  group('StalenessGuard — dos operaciones concurrentes de la misma clave', () {
    test('1-2) la que RESERVÓ secuencia después gana, sin importar cuál resuelve primero', () {
      final guard = StalenessGuard();

      // Dos _refresh() que se solapan: el #1 arranca, luego el #2 arranca
      // antes de que el #1 resuelva (ej. push + resume casi simultáneos).
      final epoch1 = guard.beginAccountEpoch();
      final seq1 = guard.beginSequence();
      final epoch2 = guard.beginAccountEpoch();
      final seq2 = guard.beginSequence();

      // El #2 (más nuevo) resuelve PRIMERO — su resultado debe aplicarse.
      expect(guard.isCurrent(epoch2, seq2), isTrue);

      expect(guard.isCurrent(epoch1, seq1), isFalse,
          reason: 'la operación #1 arrancó antes que la #2, así que su resultado es obsoleto '
              'aunque resuelva después en tiempo real');
    });

    test('una operación sin nada más en vuelo siempre se considera vigente', () {
      final guard = StalenessGuard();
      final epoch = guard.beginAccountEpoch();
      final seq = guard.beginSequence();
      expect(guard.isCurrent(epoch, seq), isTrue);
    });

    test('claves distintas no compiten entre sí (ThreadPage: hilo A no invalida al hilo B)', () {
      final guard = StalenessGuard();
      final epochA = guard.beginAccountEpoch();
      final seqA = guard.beginSequence('hilo-A');
      final epochB = guard.beginAccountEpoch();
      final seqB = guard.beginSequence('hilo-B');

      // Abrir el hilo B (clave distinta) no debe invalidar al hilo A.
      expect(guard.isCurrent(epochA, seqA, 'hilo-A'), isTrue);
      expect(guard.isCurrent(epochB, seqB, 'hilo-B'), isTrue);
    });

    test('5) markRead/getInbox: la respuesta obsoleta no puede regresionar el unread ya confirmado', () {
      final guard = StalenessGuard();
      final staleEpoch = guard.beginAccountEpoch();
      final staleSeq = guard.beginSequence(); // getInbox que todavía verá unread:true
      final freshEpoch = guard.beginAccountEpoch();
      final freshSeq = guard.beginSequence(); // getInbox que ya verá unread:false

      // El fresco resuelve primero y aplica unread:false.
      expect(guard.isCurrent(freshEpoch, freshSeq), isTrue);
      // El obsoleto resuelve después, todavía con unread:true — no debe
      // aplicarse (no debe "reaparecer" el badge de no leído).
      expect(guard.isCurrent(staleEpoch, staleSeq), isFalse);
    });
  });

  group('StalenessGuard — _loadFromDisk() y _refresh() son complementarios, no compiten', () {
    test('una lectura de disco que solo revisa el epoch de cuenta no se invalida por un refresh de red', () {
      final guard = StalenessGuard();
      final diskEpoch = guard.beginAccountEpoch();
      guard.beginSequence(); // el _refresh() que se dispara justo después

      expect(guard.isAccountCurrent(diskEpoch), isTrue,
          reason: '_loadFromDisk() no debe verse afectado por la secuencia de _refresh()');
    });
  });

  group('StalenessGuard — cambio de cuenta (logout) invalida lo que esté en vuelo', () {
    test('3-4) una operación que capturó su epoch ANTES de invalidateAccount() queda obsoleta', () {
      final guard = StalenessGuard();
      final epoch = guard.beginAccountEpoch();
      final seq = guard.beginSequence();

      // Logout: exactamente lo que hace clearCache() en las 3 pantallas.
      guard.invalidateAccount();

      expect(guard.isAccountCurrent(epoch), isFalse);
      expect(guard.isCurrent(epoch, seq), isFalse);

      // Ni siquiera una cuenta que vuelve a "loguearse" (nuevo epoch)
      // resucita la operación vieja.
      final newEpoch = guard.beginAccountEpoch();
      final newSeq = guard.beginSequence();
      expect(guard.isCurrent(newEpoch, newSeq), isTrue);
      expect(guard.isCurrent(epoch, seq), isFalse);
    });

    test('invalidateAccount() sin nada en vuelo no rompe la siguiente operación normal', () {
      final guard = StalenessGuard();
      guard.invalidateAccount();
      final epoch = guard.beginAccountEpoch();
      final seq = guard.beginSequence();
      expect(guard.isCurrent(epoch, seq), isTrue);
    });
  });

  group('las 3 pantallas quedan cableadas al guard vía clearCache() (integración liviana)', () {
    test('InboxPage.clearCache() invalida cualquier operación en vuelo capturada antes', () {
      final epoch = InboxPage.debugGuard.beginAccountEpoch();
      final seq = InboxPage.debugGuard.beginSequence();
      InboxPage.clearCache();
      expect(InboxPage.debugGuard.isCurrent(epoch, seq), isFalse);
    });

    test('ThreadPage.clearCache() invalida cualquier operación en vuelo capturada antes (cualquier hilo)', () {
      final epoch = ThreadPage.debugGuard.beginAccountEpoch();
      final seq = ThreadPage.debugGuard.beginSequence('t1');
      ThreadPage.clearCache();
      expect(ThreadPage.debugGuard.isCurrent(epoch, seq, 't1'), isFalse);
    });

    test('NewMessagePage.clearCache() invalida cualquier operación en vuelo capturada antes', () {
      final epoch = NewMessagePage.debugGuard.beginAccountEpoch();
      final seq = NewMessagePage.debugGuard.beginSequence();
      NewMessagePage.clearCache();
      expect(NewMessagePage.debugGuard.isCurrent(epoch, seq), isFalse);
    });
  });
}
