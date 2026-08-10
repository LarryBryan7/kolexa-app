// attendance.module.ts — Módulo de Asistencia

import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  // controllers: quién maneja las peticiones HTTP
  controllers: [AttendanceController],

  // providers: servicios disponibles dentro de este módulo
  // NestJS los instancia y los inyecta donde se necesiten
  providers: [AttendanceService],

  // exports: qué puede usar OTRO módulo si importa AttendanceModule
  // (por ahora no exportamos nada — no hay otro módulo que lo necesite)
  exports: [AttendanceService],
})
export class AttendanceModule {}
