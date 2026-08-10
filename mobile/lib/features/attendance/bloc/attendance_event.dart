// attendance_event.dart — Eventos del BLoC de Asistencia

sealed class AttendanceEvent {
  const AttendanceEvent();
}

// ── LoadTodayAttendanceEvent ──────────────────────────────
// Se dispara cuando el profesor abre la pantalla de asistencia.
// El BLoC carga (o crea) la sesión del día para el aula indicada.
final class LoadTodayAttendanceEvent extends AttendanceEvent {
  final int classroomId;

  const LoadTodayAttendanceEvent(this.classroomId);
}

// ── UpdateStudentStatusEvent ──────────────────────────────
final class UpdateStudentStatusEvent extends AttendanceEvent {
  final int studentId;
  final AttendanceStatusChange status; // el nuevo estado

  const UpdateStudentStatusEvent({
    required this.studentId,
    required this.status,
  });
}

// ── AttendanceStatusChange ────────────────────────────────
// Datos que acompañan al cambio de estado de un alumno.
// Clase separada para mantener el evento limpio.
class AttendanceStatusChange {
  final String status;        // 'present', 'absent', 'late', 'excused'
  final int? lateMinutes;
  final String? justification;

  const AttendanceStatusChange({
    required this.status,
    this.lateMinutes,
    this.justification,
  });
}

// ── SaveAttendanceEvent ───────────────────────────────────
// El profesor presiona el botón "Guardar".
// El BLoC envía todos los registros modificados al backend.
final class SaveAttendanceEvent extends AttendanceEvent {
  const SaveAttendanceEvent();
}

// ── LoadStudentHistoryEvent ───────────────────────────────
// El padre quiere ver el historial de asistencia de su hijo.
// Se dispara al abrir la pantalla de historial.
final class LoadStudentHistoryEvent extends AttendanceEvent {
  final int studentId;
  final int limit;
  final int offset;

  const LoadStudentHistoryEvent({
    required this.studentId,
    this.limit = 30,
    this.offset = 0,
  });
}
