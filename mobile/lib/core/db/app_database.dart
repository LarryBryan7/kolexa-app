// app_database.dart — Base de datos local del dispositivo (Drift)

import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart' show getDatabasesPath;

import 'drift/threads_drift_db.dart';

class AppDatabase {
  AppDatabase._();
  static final AppDatabase instance = AppDatabase._();

  ThreadsDriftDb? _db;
  int? _currentUserId;

  Future<void>? _pendingOpen;

  int _generation = 0;

  Future<void> openForUser(int userId) {
    if (_currentUserId == userId && _db != null) return Future.value();
    final myGeneration = ++_generation;
    final future = _openForUser(userId, myGeneration);
    _pendingOpen = future;
    return future;
  }

  Future<void> _openForUser(int userId, int myGeneration) async {
    final previous = _db;
    _db = null;
    await previous?.close();
    final path = join(await getDatabasesPath(), 'kolexa_$userId.db');
    // Drift (a diferencia de sqflite) no crea el directorio contenedor
    // por sí solo si faltara.
    await Directory(dirname(path)).create(recursive: true);
    final opened = ThreadsDriftDb(NativeDatabase(File(path)));
    if (myGeneration != _generation) {
      // Se cerró sesión (o se abrió otra cuenta) mientras esto corría.
      await opened.close();
      return;
    }
    _db = opened;
    _currentUserId = userId;
  }

  Future<void> close() {
    _generation++; // invalida cualquier openForUser en vuelo
    _pendingOpen = null;
    final db = _db;
    _db = null;
    _currentUserId = null;
    return db?.close() ?? Future.value();
  }

  Future<ThreadsDriftDb> get database async {
    if (_db == null && _pendingOpen != null) await _pendingOpen;
    final db = _db;
    if (db == null) {
      throw StateError(
          'AppDatabase usado sin sesión activa — hay que llamar a openForUser() primero.');
    }
    return db;
  }

  @visibleForTesting
  int? get debugCurrentUserId => _currentUserId;
}
