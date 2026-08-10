// attendance_model.dart — Modelos de datos de Asistencia

// ── AttendanceStatus ──────────────────────────────────────
enum AttendanceStatus {
  present,  // asistió
  absent,   // faltó sin justificación
  late,     // llegó tarde
  excused,  // falta justificada
}

// Extensión para convertir entre String (API) y AttendanceStatus (Dart)
extension AttendanceStatusExtension on AttendanceStatus {
  // Convierte enum → String para enviar al backend
  String toJson() {
    switch (this) {
      case AttendanceStatus.present:
        return 'present';
      case AttendanceStatus.absent:
        return 'absent';
      case AttendanceStatus.late:
        return 'late';
      case AttendanceStatus.excused:
        return 'excused';
    }
  }

  // Texto en español para mostrar en la UI
  String get label {
    switch (this) {
      case AttendanceStatus.present:
        return 'Presente';
      case AttendanceStatus.absent:
        return 'Ausente';
      case AttendanceStatus.late:
        return 'Tardanza';
      case AttendanceStatus.excused:
        return 'Justificado';
    }
  }
}

// Función inversa: convierte String → AttendanceStatus
AttendanceStatus attendanceStatusFromJson(String value) {
  switch (value) {
    case 'absent':
      return AttendanceStatus.absent;
    case 'late':
      return AttendanceStatus.late;
    case 'excused':
      return AttendanceStatus.excused;
    case 'present':
    default:
      return AttendanceStatus.present;
  }
}

// ── StudentSummaryModel ───────────────────────────────────
// Datos mínimos del alumno que se muestran en la lista de asistencia.
// No traemos todos los datos del alumno — solo lo que necesitamos.
class StudentSummaryModel {
  final int id;
  final String firstName;
  final String lastName;
  final String? code;    // código/número de lista del alumno
  final String? avatar;  // URL de la foto

  const StudentSummaryModel({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.code,
    this.avatar,
  });

  // Nombre completo para mostrar en la lista
  String get fullName => '$lastName, $firstName'; // "Pérez, Juan" (apellido primero)

  factory StudentSummaryModel.fromJson(Map<String, dynamic> json) {
    return StudentSummaryModel(
      id: int.parse(json['id'].toString()),
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      code: json['code'] as String?,
      avatar: json['avatar'] as String?,
    );
  }
}

// ── AttendanceRecordModel ─────────────────────────────────
// El estado de asistencia de UN alumno en UNA sesión.
// Corresponde a la tabla attendance_records de la DB.
class AttendanceRecordModel {
  final int id;
  final int studentId;
  final AttendanceStatus status;
  final int? lateMinutes;      // minutos de retraso (solo cuando es 'late')
  final String? justification; // razón de la falta justificada
  final StudentSummaryModel student; // datos del alumno (viene incluido en el JSON)

  bool isModified;

  AttendanceRecordModel({
    required this.id,
    required this.studentId,
    required this.status,
    this.lateMinutes,
    this.justification,
    required this.student,
    this.isModified = false, // por defecto, ningún registro está modificado
  });

  factory AttendanceRecordModel.fromJson(Map<String, dynamic> json) {
    return AttendanceRecordModel(
      id: int.parse(json['id'].toString()),
      studentId: int.parse(json['studentId'].toString()),
      // Convertir el string del status a enum
      status: attendanceStatusFromJson(json['status'] as String),
      lateMinutes: json['lateMinutes'] as int?,
      justification: json['justification'] as String?,
      // El backend incluye el objeto 'student' anidado en cada registro
      student: StudentSummaryModel.fromJson(
        json['student'] as Map<String, dynamic>,
      ),
    );
  }

  AttendanceRecordModel copyWith({
    AttendanceStatus? status,
    int? lateMinutes,
    String? justification,
    bool? isModified,
  }) {
    return AttendanceRecordModel(
      id: id,
      studentId: studentId,
      status: status ?? this.status,
      lateMinutes: lateMinutes ?? this.lateMinutes,
      justification: justification ?? this.justification,
      student: student,
      isModified: isModified ?? this.isModified,
    );
  }

  // Convierte el registro a JSON para enviar al backend
  Map<String, dynamic> toJson() {
    return {
      'studentId': studentId,
      'status': status.toJson(),
      if (lateMinutes != null) 'lateMinutes': lateMinutes,
      if (justification != null) 'justification': justification,
    };
  }
}

// ── AttendanceSessionModel ────────────────────────────────
// Una sesión completa de asistencia: la sesión + todos los registros.
// Corresponde a la tabla attendance de la DB.
class AttendanceSessionModel {
  final int id;
  final int classroomId;
  final String classroomName;  // "Aula 3A", "Primero B", etc.
  final String? courseName;    // nombre del curso/materia (puede ser null)
  final DateTime date;
  final String? notes;
  final List<AttendanceRecordModel> records; // un registro por alumno

  const AttendanceSessionModel({
    required this.id,
    required this.classroomId,
    required this.classroomName,
    this.courseName,
    required this.date,
    this.notes,
    required this.records,
  });

  factory AttendanceSessionModel.fromJson(Map<String, dynamic> json) {
    // El backend incluye el objeto 'classroom' anidado
    final classroom = json['classroom'] as Map<String, dynamic>;
    final course = json['course'] as Map<String, dynamic>?;

    return AttendanceSessionModel(
      id: int.parse(json['id'].toString()),
      classroomId: classroom['id'] as int,
      // Construimos un nombre descriptivo del aula
      classroomName:
          '${classroom['grade']}° ${classroom['section']} — ${classroom['name']}',
      courseName: course?['name'] as String?,
      // DateTime.parse convierte "2024-03-15T00:00:00.000Z" → DateTime
      date: DateTime.parse(json['date'] as String),
      notes: json['notes'] as String?,
      // Convertir la lista JSON a lista de modelos Dart
      records: (json['records'] as List<dynamic>)
          .map((r) => AttendanceRecordModel.fromJson(r as Map<String, dynamic>))
          .toList(),
    );
  }

  // Estadísticas calculadas sobre la marcha (sin petición extra al backend)
  int get presentCount =>
      records.where((r) => r.status == AttendanceStatus.present).length;
  int get absentCount =>
      records.where((r) => r.status == AttendanceStatus.absent).length;
  int get lateCount =>
      records.where((r) => r.status == AttendanceStatus.late).length;
  int get excusedCount =>
      records.where((r) => r.status == AttendanceStatus.excused).length;
  int get totalStudents => records.length;

  // Porcentaje de asistencia (para mostrar en el resumen)
  double get attendanceRate {
    if (totalStudents == 0) return 0;
    return (presentCount + lateCount) / totalStudents * 100;
  }
}
