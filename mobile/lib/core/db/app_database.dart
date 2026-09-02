// app_database.dart — Base de datos SQLite local del dispositivo

import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class AppDatabase {
  AppDatabase._();
  static final AppDatabase instance = AppDatabase._();

  Database? _db;
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
    final opened = await openDatabase(path, version: 1, onCreate: _onCreate);
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

  Future<Database> get database async {
    if (_db == null && _pendingOpen != null) await _pendingOpen;
    final db = _db;
    if (db == null) {
      throw StateError(
          'AppDatabase usado sin sesión activa — hay que llamar a openForUser() primero.');
    }
    return db;
  }

  static Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE inbox_threads (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        subject TEXT,
        studentId TEXT,
        studentName TEXT,
        priority TEXT NOT NULL,
        lastMessageAt INTEGER NOT NULL,
        unread INTEGER NOT NULL,
        unreadCount INTEGER NOT NULL,
        muted INTEGER NOT NULL,
        otherId TEXT,
        otherName TEXT,
        otherAvatar TEXT,
        otherOnline INTEGER,
        lastMsgBody TEXT,
        lastMsgSenderId TEXT,
        lastMsgSentAt INTEGER,
        lastMsgDelivered INTEGER,
        sortIndex INTEGER NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE thread_messages (
        id TEXT PRIMARY KEY,
        threadId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        senderName TEXT NOT NULL,
        body TEXT NOT NULL,
        sentAt INTEGER NOT NULL
      )
    ''');
    await db.execute('CREATE INDEX idx_thread_messages_threadId ON thread_messages(threadId)');
    await db.execute('''
      CREATE TABLE thread_meta (
        threadId TEXT PRIMARY KEY,
        otherLastReadAt INTEGER,
        otherLastActiveAt INTEGER
      )
    ''');
    await db.execute('''
      CREATE TABLE contacts (
        userId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        role TEXT NOT NULL,
        studentsJson TEXT NOT NULL,
        sortIndex INTEGER NOT NULL
      )
    ''');
  }
}
