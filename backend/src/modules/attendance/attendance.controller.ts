// attendance.controller.ts — Controlador de Asistencia

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceRecordsDto } from './dto/update-records.dto';
import { CurrentUser, UserPayload } from '../../common/decorators/current-user.decorator';

@Controller('attendance')
export class AttendanceController {
  // El Service se inyecta en el constructor (DI de NestJS)
  constructor(private readonly attendanceService: AttendanceService) {}

  // ── POST /attendance ──────────────────────────────────────
  @Post()
  async createSession(
    @Body() dto: CreateAttendanceDto,
    @CurrentUser() user: UserPayload,
  ) {
    // user.sub es el ID del usuario en la DB (viene del JWT)
    return this.attendanceService.createSession(dto, user.sub);
  }

  // ── GET /attendance/classroom/:classroomId ─────────────────
  @Get('classroom/:classroomId')
  async getByClassroom(
    @Param('classroomId', ParseIntPipe) classroomId: number,
    // ParseIntPipe convierte el string del parámetro a número
    // y lanza 400 automáticamente si no es un número válido
    @Query('date') date: string,
  ) {
    // Si no se provee fecha, usar hoy
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    return this.attendanceService.getByClassroom(classroomId, targetDate);
  }

  // ── GET /attendance/student/:studentId/history ─────────────
  // Historial de asistencia de un alumno (lo ve el padre).
  // Query params opcionales: ?limit=30&offset=0 (paginación)
  @Get('student/:studentId/history')
  async getStudentHistory(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.attendanceService.getStudentHistory(
      studentId,
      user.sub,
      limit ? parseInt(limit, 10) : 30,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // ── GET /attendance/:id ────────────────────────────────────
  // Obtiene una sesión de asistencia por su ID, con todos los registros.
  // ParseIntPipe lanza 400 si :id no es un número.
  @Get(':id')
  async getSession(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.getSession(BigInt(id));
  }

  // ── PUT /attendance/:id/records ────────────────────────────
  // El profesor actualiza el estado de asistencia de los alumnos.
  // Body: UpdateAttendanceRecordsDto { records: [...] }
  @Put(':id/records')
  async updateRecords(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceRecordsDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.attendanceService.updateRecords(BigInt(id), dto, user.sub);
  }
}
