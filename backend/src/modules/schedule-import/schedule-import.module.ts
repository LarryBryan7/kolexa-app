// schedule-import.module.ts — Importar horario de aula desde foto

import { Module } from '@nestjs/common';
import { ScheduleImportController } from './schedule-import.controller';
import { ScheduleImportService } from './schedule-import.service';
import { ClassroomImportService } from './classroom-import.service';
import { GeminiScheduleService } from './gemini-schedule.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScheduleImportController],
  providers: [ScheduleImportService, ClassroomImportService, GeminiScheduleService],
  exports: [ScheduleImportService, ClassroomImportService, GeminiScheduleService],
})
export class ScheduleImportModule {}
